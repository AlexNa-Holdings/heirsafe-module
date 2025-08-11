// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

interface IHeirSafeModule {
    function setUp(bytes memory initParams) external;
    function avatar() external view returns (address);
}

/// Factory that deploys a per-Safe instance of HeirSafeModule (minimal proxy, CREATE2).
/// Deterministic address: depends on (implementation, salt, this factory).
contract HeirSafeModuleFactory {
    using Clones for address;

    event ModuleDeployed(address indexed safe, address indexed module, bytes32 salt);

    address public immutable implementation;

    constructor(address _implementation) {
        require(_implementation != address(0), "impl required");
        implementation = _implementation;
    }

    /// Compute the salt we’ll use (you can also pass your own salt if you prefer).
    function saltFor(address safe, bytes32 extraSalt) public pure returns (bytes32) {
        return keccak256(abi.encodePacked("HeirSafeModule", safe, extraSalt));
    }

    /// Predict the module address for (safe, extraSalt)
    function predict(address safe, bytes32 extraSalt) external view returns (address) {
        bytes32 salt = saltFor(safe, extraSalt);
        return implementation.predictDeterministicAddress(salt, address(this));
    }

    /// Deploy (or revert if already deployed), then call setUp(abi.encode(safe)).
    function deploy(address safe, bytes32 extraSalt) external returns (address module) {
        bytes32 salt = saltFor(safe, extraSalt);
        module = implementation.cloneDeterministic(salt);
        IHeirSafeModule(module).setUp(abi.encode(safe));
        emit ModuleDeployed(safe, module, salt);
    }
}
