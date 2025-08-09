// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@gnosis.pm/zodiac/contracts/core/Module.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

interface ISafe {
    function getOwners() external view returns (address[] memory);
}

contract HeirSafeModule is Module {
    // Mapping to store each owner's beneficiary and activation timestamp
    struct HeirConfig {
        address beneficiary;
        uint256 activationTimestamp;
    }

    mapping(address => HeirConfig) public heirConfigs;

    event BeneficiarySet(address indexed owner, address indexed beneficiary);
    event ActivationTimeSet(address indexed owner, uint256 newTimestamp);
    event OwnerClaimed(address indexed oldOwner, address indexed newOwner);

    // Initialize the module with Safe address
    function setUp(bytes memory initializeParams) public override initializer {
        // Set the deployer as the initial owner.
        __Ownable_init(msg.sender);

        // Now you can call owner-only functions.
        address _safe = abi.decode(initializeParams, (address));
        setAvatar(_safe);
        setTarget(_safe);

        // Finally, transfer ownership from the deployer to the Safe.
        transferOwnership(_safe);
    }

    // Any Safe owner sets their beneficiary and activation timestamp
    function setBeneficiary(
        address _beneficiary,
        uint256 _activationTimestamp
    ) external onlyOwner {
        require(_beneficiary != address(0), "Invalid beneficiary address");
        require(
            _activationTimestamp > block.timestamp,
            "Activation time must be in the future"
        );

        heirConfigs[msg.sender] = HeirConfig({
            beneficiary: _beneficiary,
            activationTimestamp: _activationTimestamp
        });
        emit BeneficiarySet(msg.sender, _beneficiary);
        emit ActivationTimeSet(msg.sender, _activationTimestamp);
    }

    // Owner sets a new activation timestamp
    function setActivationTime(
        uint256 _newActivationTimestamp
    ) external onlyOwner {
        HeirConfig storage config = heirConfigs[msg.sender];
        require(config.beneficiary != address(0), "No beneficiary set");
        require(
            _newActivationTimestamp > block.timestamp,
            "New activation time must be in the future"
        );

        config.activationTimestamp = _newActivationTimestamp;
        emit ActivationTimeSet(msg.sender, _newActivationTimestamp);
    }

    // Beneficiary claims ownership by replacing the specified owner
    function claimSafe(address oldOwner) external {
        HeirConfig memory config = heirConfigs[oldOwner];
        require(
            config.beneficiary != address(0),
            "No beneficiary set for owner"
        );
        require(
            msg.sender == config.beneficiary,
            "Only designated beneficiary can claim"
        );
        require(
            block.timestamp >= config.activationTimestamp,
            "Activation time not reached"
        );

        // Find prevOwner from Safe's owner list
        address[] memory owners = ISafe(avatar).getOwners();
        address prevOwner = address(0);
        for (uint256 i = 0; i < owners.length; i++) {
            if (owners[i] == oldOwner && i > 0) {
                prevOwner = owners[i - 1];
                break;
            }
        }
        require(
            prevOwner != address(0) || owners[0] == oldOwner,
            "Owner not found in Safe"
        );

        // Encode call to Safe's swapOwner function
        bytes memory data = abi.encodeWithSignature(
            "swapOwner(address,address,address)",
            prevOwner,
            oldOwner,
            msg.sender
        );

        // Execute swapOwner on the Safe
        exec(avatar, 0, data, Enum.Operation.Call);
        emit OwnerClaimed(oldOwner, msg.sender);

        // Clear the configuration to prevent reuse
        delete heirConfigs[oldOwner];
    }
}
