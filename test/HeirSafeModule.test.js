const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("HeirSafeModule", function () {
  let safeMock, module, owner, beneficiary, otherOwner, otherBeneficiary, nonOwner;

  // Use the contract with the corrected setUp function for these tests.
  // Also use the updated SafeMock contract.
  beforeEach(async function () {
    [owner, beneficiary, otherOwner, otherBeneficiary, nonOwner] = await ethers.getSigners();

    // 1. Deploy mock Safe
    const SafeMock = await ethers.getContractFactory("SafeMock");
    safeMock = await SafeMock.deploy([owner.address, otherOwner.address], 1);
    await safeMock.waitForDeployment();

    // 2. Deploy HeirSafeModule
    const HeirSafeModule = await ethers.getContractFactory("HeirSafeModule");
    module = await HeirSafeModule.deploy();
    await module.waitForDeployment();

    // 3. Initialize module with setUp
    const initParams = ethers.AbiCoder.defaultAbiCoder().encode(["address"], [safeMock.target]);
    await module.setUp(initParams); // No need to connect owner, anyone can initialize it once

    // 4. Enable module on mock Safe (simulation)
    await safeMock.connect(owner).enableModule(module.target);
  });

  it("should initialize with correct Safe address as owner", async function () {
    expect(await module.avatar()).to.equal(safeMock.target);
    expect(await module.target()).to.equal(safeMock.target);
    expect(await module.owner()).to.equal(safeMock.target);
  });

  it("should allow a Safe owner to set beneficiary and activation time via the Safe", async function () {
    const activationTime = Math.floor(Date.now() / 1000) + 31536000;

    // Encode the calldata for the module's setBeneficiary function
    const setBeneficiaryData = module.interface.encodeFunctionData("setBeneficiary", [
      beneficiary.address,
      activationTime,
    ]);

    // The Safe owner calls the Safe, which in turn calls the module
    const tx = await safeMock.connect(owner).executeTransaction(module.target, 0, setBeneficiaryData);

    // Assert that the events were emitted by the module
    await expect(tx)
      .to.emit(module, "BeneficiarySet")
      .withArgs(owner.address, beneficiary.address)
      .to.emit(module, "ActivationTimeSet")
      .withArgs(owner.address, activationTime);

    const config = await module.heirConfigs(owner.address);
    expect(config.beneficiary).to.equal(beneficiary.address);
    expect(config.activationTimestamp).to.equal(activationTime);
  });

  it("should revert if a non-owner of the Safe tries to set a beneficiary", async function () {
    const activationTime = Math.floor(Date.now() / 1000) + 31536000;
    const setBeneficiaryData = module.interface.encodeFunctionData("setBeneficiary", [
      beneficiary.address,
      activationTime,
    ]);

    // A non-owner of the Safe attempts to execute the transaction
    await expect(
      safeMock.connect(nonOwner).executeTransaction(module.target, 0, setBeneficiaryData)
    ).to.be.revertedWith("MockSafe: caller is not an owner");
  });

  it("should allow a Safe owner to update activation time via the Safe", async function () {
    const initialTime = Math.floor(Date.now() / 1000) + 31536000;
    
    // First, set an initial beneficiary
    const setBeneficiaryData = module.interface.encodeFunctionData("setBeneficiary", [beneficiary.address, initialTime]);
    await safeMock.connect(owner).executeTransaction(module.target, 0, setBeneficiaryData);

    // Now, encode calldata for updating the time
    const newTime = initialTime + 1000;
    const setActivationTimeData = module.interface.encodeFunctionData("setActivationTime", [newTime]);
    
    const tx = await safeMock.connect(owner).executeTransaction(module.target, 0, setActivationTimeData);
    
    await expect(tx)
        .to.emit(module, "ActivationTimeSet")
        .withArgs(owner.address, newTime);
        
    const config = await module.heirConfigs(owner.address);
    expect(config.activationTimestamp).to.equal(newTime);
  });

  it("should allow beneficiary to claim ownership after activation time", async function () {
    const activationTime = Math.floor(Date.now() / 1000) + 1000;
    
    // Setup beneficiary via Safe
    const setBeneficiaryData = module.interface.encodeFunctionData("setBeneficiary", [beneficiary.address, activationTime]);
    await safeMock.connect(owner).executeTransaction(module.target, 0, setBeneficiaryData);

    // Fast-forward time
    await ethers.provider.send("evm_increaseTime", [1001]);
    await ethers.provider.send("evm_mine");

    // Beneficiary directly calls claimSafe on the module
    await expect(module.connect(beneficiary).claimSafe(owner.address))
      .to.emit(module, "OwnerClaimed")
      .withArgs(owner.address, beneficiary.address);

    const newOwners = await safeMock.getOwners();
    expect(newOwners).to.include(beneficiary.address);
    expect(newOwners).to.not.include(owner.address);
  });

  // Keep other tests for failure cases (e.g., claiming too early, wrong beneficiary)
  // They should work as-is since claimSafe is not an owner-only function.
  it("should revert claimSafe if before activation time", async function () {
    const activationTime = Math.floor(Date.now() / 1000) + 31536000;
    const setBeneficiaryData = module.interface.encodeFunctionData("setBeneficiary", [beneficiary.address, activationTime]);
    await safeMock.connect(owner).executeTransaction(module.target, 0, setBeneficiaryData);

    await expect(
      module.connect(beneficiary).claimSafe(owner.address)
    ).to.be.revertedWith("Activation time not reached");
  });
});