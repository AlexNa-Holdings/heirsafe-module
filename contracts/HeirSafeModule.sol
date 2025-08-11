// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Enum } from "@gnosis.pm/safe-contracts/contracts/common/Enum.sol";
import { Module } from "@gnosis.pm/zodiac/contracts/core/Module.sol";

// Minimal Safe surface we need
interface ISafe {
    function getOwners() external view returns (address[] memory);
    function isOwner(address) external view returns (bool);
}

/// Each Safe *owner* configures their own beneficiary + activation time via direct calls.
/// No other owners influence it. The module executes the final owner swap *into the Safe*.
contract HeirSafeModule is Module {
    event BeneficiarySet(address indexed owner, address indexed beneficiary);
    event ActivationTimeSet(address indexed owner, uint256 activationTime);

    struct HeirConfig {
        address beneficiary;
        uint256 activationTime;
    }

    // Keyed by EOA owner address (not the Safe)
    mapping(address => HeirConfig) public heirConfigs;

    /// Zodiac initializer (called by factory or manually in tests)
    /// Expected data: abi.encode(address safe)
    function setUp(bytes memory initParams) public override initializer {
        address safe = abi.decode(initParams, (address));
        require(safe != address(0), "Safe required");

        // In classic Zodiac, avatar is the Safe the module acts on; target often == avatar
        __Ownable_init(msg.sender);             // Module’s own admin (Zodiac pattern)
        avatar = safe;                          // where exec() sends txs
        target = safe;                          // optional; keep equal to avatar for clarity
    }

    // ---------- owner-managed config (direct calls) ----------

    function setBeneficiary(address beneficiary, uint256 activationTime) external {
        require(_isSafeOwner(msg.sender), "Not a Safe owner");
        require(beneficiary != address(0), "Invalid beneficiary");
        require(activationTime > block.timestamp, "Activation must be future");

        heirConfigs[msg.sender] = HeirConfig(beneficiary, activationTime);
        emit BeneficiarySet(msg.sender, beneficiary);
        emit ActivationTimeSet(msg.sender, activationTime);
    }

    function removeBeneficiary() external {
        require(_isSafeOwner(msg.sender), "Not a Safe owner");
        HeirConfig storage cfg = heirConfigs[msg.sender];
        require(cfg.beneficiary != address(0), "No beneficiary set");

        delete heirConfigs[msg.sender];
        emit BeneficiarySet(msg.sender, address(0));
    }

    function setActivationTime(uint256 newActivationTime) external {
        require(_isSafeOwner(msg.sender), "Not a Safe owner");
        HeirConfig storage cfg = heirConfigs[msg.sender];
        require(cfg.beneficiary != address(0), "No beneficiary set");
        require(newActivationTime > block.timestamp, "Activation must be future");

        cfg.activationTime = newActivationTime;
        emit ActivationTimeSet(msg.sender, newActivationTime);
    }

    // ---------- claiming flow ----------
    // Safe’s swapOwner(prev, old, new) needs the previous owner in its internal list.
    // We accept prevOwner as a parameter to avoid O(n) on-chain scanning.
    function claimSafe(address owner, address prevOwner) external {
        HeirConfig memory cfg = heirConfigs[owner];
        require(cfg.beneficiary != address(0), "No beneficiary set for owner");
        require(msg.sender == cfg.beneficiary, "Only beneficiary");
        require(block.timestamp >= cfg.activationTime, "Activation time not reached");

        // Build swapOwner(prevOwner, oldOwner, newOwner)
        bytes memory data = abi.encodeWithSignature(
            "swapOwner(address,address,address)",
            prevOwner,
            owner,
            msg.sender
        );

        // Use Zodiac’s exec helper — routes into Safe via execTransactionFromModule
        // Enum.Operation.Call == 0
        bool ok = exec(target, 0, data, Enum.Operation.Call);
        require(ok, "Safe swapOwner failed");

        delete heirConfigs[owner]; // one-shot
    }




    // ---------- helpers ----------

    function _isSafeOwner(address who) internal view returns (bool) {
        address safe = avatar;
        // Prefer isOwner when available
        try ISafe(safe).isOwner(who) returns (bool yes) {
            return yes;
        } catch {
            address[] memory owners = ISafe(safe).getOwners();
            for (uint256 i = 0; i < owners.length; i++) if (owners[i] == who) return true;
            return false;
        }
    }
}
