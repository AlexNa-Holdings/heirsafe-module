// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract SafeMock {
    address[] public owners;
    uint256 public threshold;
    mapping(address => bool) public isOwner;

    modifier onlySafeOwner() {
        require(isOwner[msg.sender], "MockSafe: caller is not an owner");
        _;
    }

    constructor(address[] memory _owners, uint256 _threshold) {
        for (uint256 i = 0; i < _owners.length; i++) {
            address owner = _owners[i];
            require(owner != address(0), "Invalid owner");
            isOwner[owner] = true;
        }
        owners = _owners;
        threshold = _threshold;
    }

    function enableModule(address module) external {
        // Simulate enabling a module
    }

    function getOwners() external view returns (address[] memory) {
        return owners;
    }
    
    // Function to simulate the Safe executing a transaction
    function executeTransaction(address to, uint256 value, bytes calldata data) external onlySafeOwner {
        (bool success, ) = to.call{value: value}(data);
        require(success, "MockSafe: Module transaction failed");
    }

    function swapOwner(address , address oldOwner, address newOwner) external onlySafeOwner {
        for (uint256 i = 0; i < owners.length; i++) {
            if (owners[i] == oldOwner) {
                // Simplified logic for mock: does not validate prevOwner
                owners[i] = newOwner;
                isOwner[oldOwner] = false;
                isOwner[newOwner] = true;
                break;
            }
        }
    }

    function removeOwner(address , address owner) external onlySafeOwner {
        require(isOwner[owner], "MockSafe: owner to remove not found");
        address[] memory newOwners = new address[](owners.length - 1);
        uint256 j = 0;
        for (uint256 i = 0; i < owners.length; i++) {
            if (owners[i] != owner) {
                newOwners[j] = owners[i];
                j++;
            }
        }
        owners = newOwners;
        isOwner[owner] = false;
    }

    function getThreshold() external view returns (uint256) {
        return threshold;
    }
}