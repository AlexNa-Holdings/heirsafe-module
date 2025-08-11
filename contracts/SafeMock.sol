// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// Minimal Safe-like mock for testing Zodiac modules.
/// - Owners stored in an array (no sentinel).
/// - Modules can be enabled and then call execTransactionFromModule(...)
/// - swapOwner(prev, old, new) validates prev and replaces owner.
/// - Tracks the calling module during execTransactionFromModule so that
///   internal self-calls are authorized (mirrors real Safe behavior).
contract SafeMock {
    // --- Owners ---
    address[] private _owners;
    mapping(address => bool) public isOwner;
    uint256 public threshold;

    // --- Modules ---
    mapping(address => bool) public enabledModule;

    // Tracks the module currently executing via execTransactionFromModule
    address private _currentModule;

    event ModuleEnabled(address module);
    event OwnerSwapped(
        address indexed prevOwner,
        address indexed oldOwner,
        address indexed newOwner
    );

    constructor(address[] memory owners_, uint256 threshold_) payable {
        require(owners_.length > 0, "owners required");
        require(
            threshold_ >= 1 && threshold_ <= owners_.length,
            "bad threshold"
        );
        for (uint256 i = 0; i < owners_.length; i++) {
            address o = owners_[i];
            require(o != address(0), "zero owner");
            require(!isOwner[o], "dup owner");
            isOwner[o] = true;
            _owners.push(o);
        }
        threshold = threshold_;
    }

    // ---------- Owner surface ----------

    function getOwners() external view returns (address[] memory) {
        return _owners;
    }

    // ---------- Module management ----------

    // Open for tests; in real Safe this would be privileged.
    function enableModule(address module) external {
        require(module != address(0), "zero module");
        enabledModule[module] = true;
        emit ModuleEnabled(module);
    }

    // ---------- Execution from module ----------

    /// operation: 0 = CALL, 1 = DELEGATECALL
    function execTransactionFromModule(
        address to,
        uint256 value,
        bytes calldata data,
        uint8 operation
    ) external returns (bool success) {
        require(enabledModule[msg.sender], "module not enabled");
        _currentModule = msg.sender; // remember who initiated

        if (operation == 0) {
            // CALL
            (success, ) = to.call{value: value}(data);
        } else if (operation == 1) {
            // DELEGATECALL
            assembly {
                let ptr := mload(0x40)
                let result := delegatecall(
                    gas(),
                    to,
                    add(data.offset, 0x20),
                    mload(data.offset),
                    0,
                    0
                )
                let size := returndatasize()
                returndatacopy(ptr, 0, size)
                switch result
                case 0 {
                    revert(ptr, size)
                }
                default {
                    success := 1
                }
            }
        } else {
            revert("bad operation");
        }

        _currentModule = address(0); // clear on success path
    }

    // ---------- Owner management ----------

    // Allow either: direct owner call, direct enabled module call,
    // or internal self-call that was initiated by an enabled module via execTransactionFromModule.
    modifier onlyOwnerOrModule() {
        bool viaModule = (msg.sender == address(this) &&
            enabledModule[_currentModule]);
        require(
            isOwner[msg.sender] || enabledModule[msg.sender] || viaModule,
            "not owner/module"
        );
        _;
    }

    /// Mirrors Safe API: swapOwner(prevOwner, oldOwner, newOwner).
    /// For index 0, prevOwner must be address(0). Otherwise prevOwner must equal owners[idx-1].
    function swapOwner(
        address prevOwner,
        address oldOwner,
        address newOwner
    ) external onlyOwnerOrModule {
        require(isOwner[oldOwner], "oldOwner !owner");
        require(newOwner != address(0), "newOwner zero");
        require(!isOwner[newOwner], "newOwner already owner");

        (uint256 idx, bool found) = _findOwner(oldOwner);
        require(found, "oldOwner missing");

        if (idx == 0) {
            require(prevOwner == address(0), "bad prev for idx0");
        } else {
            require(_owners[idx - 1] == prevOwner, "bad prev");
        }

        _owners[idx] = newOwner;
        isOwner[oldOwner] = false;
        isOwner[newOwner] = true;

        emit OwnerSwapped(prevOwner, oldOwner, newOwner);
    }

    function _findOwner(address who) internal view returns (uint256, bool) {
        for (uint256 i = 0; i < _owners.length; i++) {
            if (_owners[i] == who) return (i, true);
        }
        return (type(uint256).max, false);
    }

    event ModuleDisabled(address module);

    function disableModule(address module) external {
        require(enabledModule[module], "module not enabled");
        enabledModule[module] = false;
        emit ModuleDisabled(module);
    }

    // ---------- Misc ----------

    receive() external payable {}
}
