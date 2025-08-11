const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

// Helpers (ethers v6)
const abiCoder = ethers.AbiCoder.defaultAbiCoder();

/**
 * Find prevOwner for swapOwner(). For array-based mocks, prevOwner can be:
 *  - address(0) if `owner` is at index 0 (many mocks special-case it)
 *  - owners[i-1] otherwise
 * Adjust if your mock uses a sentinel address.
 */
async function computePrevOwner(safe, owner) {
  const owners = await safe.getOwners();
  const idx = owners.findIndex((o) => o.toLowerCase() === owner.toLowerCase());
  if (idx === -1) throw new Error("owner not found in Safe owners");
  return idx === 0 ? ethers.ZeroAddress : owners[idx - 1];
}

describe("HeirSafeModule (Zodiac)", function () {
  let owner1, owner2, outsider, beneficiary, beneficiary2, deployer;
  let safe, module;

  beforeEach(async () => {
    [deployer, owner1, owner2, outsider, beneficiary, beneficiary2] =
      await ethers.getSigners();

    // --- Deploy SafeMock with 2 owners (threshold=1 is fine for tests) ---
    const SafeMock = await ethers.getContractFactory("SafeMock");
    safe = await SafeMock.deploy([owner1.address, owner2.address], 1);
    await safe.waitForDeployment();

    // --- Deploy module + setUp(bytes) with Safe address ---
    const HeirSafeModule = await ethers.getContractFactory("HeirSafeModule");
    module = await HeirSafeModule.deploy();
    await module.waitForDeployment();

    const initParams = abiCoder.encode(["address"], [await safe.getAddress()]);
    await module.setUp(initParams);

    // Sanity: avatar/target should be the Safe
    expect(await module.avatar()).to.equal(await safe.getAddress());

    // Allow module in the Safe mock (so execTransactionFromModule will be honored)
    await safe.enableModule(await module.getAddress());
  });

  it("initializes with correct Safe as avatar/target", async () => {
    // already asserted in beforeEach, but keep a dedicated test
    expect(await module.avatar()).to.equal(await safe.getAddress());
  });

  it("allows a Safe owner to set beneficiary & activation time directly", async () => {
    const now = await time.latest();
    const activation = now + 3600;

    await expect(
      module.connect(owner1).setBeneficiary(beneficiary.address, activation)
    )
      .to.emit(module, "BeneficiarySet")
      .withArgs(owner1.address, beneficiary.address)
      .and.to.emit(module, "ActivationTimeSet")
      .withArgs(owner1.address, activation);

    const cfg = await module.heirConfigs(owner1.address);
    expect(cfg.beneficiary).to.equal(beneficiary.address);
    expect(cfg.activationTime).to.equal(activation);
  });

  it("reverts setBeneficiary when called by non-owner of the Safe", async () => {
    const now = await time.latest();
    await expect(
      module.connect(outsider).setBeneficiary(beneficiary.address, now + 3600)
    ).to.be.revertedWith("Not a Safe owner");
  });

  it("allows a Safe owner to update activation time directly", async () => {
    const now = await time.latest();
    const t1 = now + 3600;
    const t2 = now + 7200;

    await module.connect(owner1).setBeneficiary(beneficiary.address, t1);

    await expect(module.connect(owner1).setActivationTime(t2))
      .to.emit(module, "ActivationTimeSet")
      .withArgs(owner1.address, t2);

    const cfg = await module.heirConfigs(owner1.address);
    expect(cfg.activationTime).to.equal(t2);
  });

  it("reverts claimSafe if called before activation time", async () => {
    const now = await time.latest();
    const activation = now + 3600;
    await module
      .connect(owner1)
      .setBeneficiary(beneficiary.address, activation);

    const prev = await computePrevOwner(safe, owner1.address);

    await expect(
      module.connect(beneficiary).claimSafe(owner1.address, prev)
    ).to.be.revertedWith("Activation time not reached");
  });

  it("allows beneficiary to claim ownership after activation time", async () => {
    const now = await time.latest();
    const activation = now + 3600;

    // owner1 configures beneficiary
    await module
      .connect(owner1)
      .setBeneficiary(beneficiary.address, activation);

    // time passes
    await time.increaseTo(activation + 1);

    // prepare prevOwner pointer
    const prev = await computePrevOwner(safe, owner1.address);

    // claim
    await expect(module.connect(beneficiary).claimSafe(owner1.address, prev)).to
      .not.be.reverted;

    // Safe owners should now include beneficiary and exclude old owner1
    expect(await safe.isOwner(owner1.address)).to.equal(false);
    expect(await safe.isOwner(beneficiary.address)).to.equal(true);

    // config cleared (one-shot)
    const cfg = await module.heirConfigs(owner1.address);
    expect(cfg.beneficiary).to.equal(ethers.ZeroAddress);
    expect(cfg.activationTime).to.equal(0);
  });

  it("keeps per-owner independence (owner2 unaffected by owner1 config/claim)", async () => {
    const now = await time.latest();
    const activation1 = now + 3600;
    const activation2 = now + 7200;

    // Owner1 sets config
    await module
      .connect(owner1)
      .setBeneficiary(beneficiary.address, activation1);
    // Owner2 sets different time but same beneficiary (allowed) or another addr
    await module
      .connect(owner2)
      .setBeneficiary(beneficiary2.address, activation2);

    // Fast-forward just past owner1’s activation
    await time.increaseTo(activation1 + 1);

    const prev1 = await computePrevOwner(safe, owner1.address);
    await module.connect(beneficiary).claimSafe(owner1.address, prev1);

    expect(await safe.isOwner(owner2.address)).to.equal(true);

    // recompute once after owner1 -> beneficiary swap
    const prev2 = await computePrevOwner(safe, owner2.address);

    // still too early
    await expect(
      module.connect(beneficiary2).claimSafe(owner2.address, prev2)
    ).to.be.revertedWith("Activation time not reached");

    // advance and claim
    await time.increaseTo(activation2 + 1);
    await expect(module.connect(beneficiary2).claimSafe(owner2.address, prev2))
      .to.not.be.reverted;
  });
  it("clears config after successful claim", async () => {
    const now = await time.latest();
    const activation = now + 3600;
    await module
      .connect(owner1)
      .setBeneficiary(beneficiary.address, activation);
    await time.increaseTo(activation + 1);
    const prev = await computePrevOwner(safe, owner1.address);
    await module.connect(beneficiary).claimSafe(owner1.address, prev);

    const cfg = await module.heirConfigs(owner1.address);
    expect(cfg.beneficiary).to.equal(ethers.ZeroAddress);
    expect(cfg.activationTime).to.equal(0);
    expect(await safe.isOwner(beneficiary.address)).to.equal(true);
  });

  it("reverts if prevOwner pointer is wrong", async () => {
    const now = await time.latest();
    const activation = now + 3600;

    await module
      .connect(owner1)
      .setBeneficiary(beneficiary.address, activation);
    await time.increaseTo(activation + 1);

    const owners = await safe.getOwners();
    const idx = owners.findIndex(
      (o) => o.toLowerCase() === owner1.address.toLowerCase()
    );

    // craft a definitely-wrong prevOwner
    let wrongPrev;
    if (idx === 0) {
      // must NOT be zero for idx0 to fail
      wrongPrev = owners.length > 1 ? owners[1] : outsider.address;
    } else {
      // must NOT equal owners[idx-1]
      wrongPrev = ethers.ZeroAddress; // guaranteed wrong for idx>0
    }

    await expect(
      module.connect(beneficiary).claimSafe(owner1.address, wrongPrev)
    ).to.be.revertedWith("Safe swapOwner failed");
  });

  it("fails to claim if module is disabled in the Safe", async () => {
    const now = await time.latest();
    const activation = now + 3600;
    await module
      .connect(owner1)
      .setBeneficiary(beneficiary.address, activation);
    await time.increaseTo(activation + 1);
    const prev = await computePrevOwner(safe, owner1.address);

    await safe.disableModule(await module.getAddress());

    await expect(
      module.connect(beneficiary).claimSafe(owner1.address, prev)
    ).to.be.revertedWith("module not enabled");
  });
    it("reverts removeBeneficiary when called by non-owner of the Safe", async () => {
    await expect(module.connect(outsider).removeBeneficiary())
      .to.be.revertedWith("Not a Safe owner");
  });

  it("reverts removeBeneficiary when no beneficiary is set", async () => {
    await expect(module.connect(owner1).removeBeneficiary())
      .to.be.revertedWith("No beneficiary set");
  });

  it("allows a Safe owner to remove beneficiary; clears config & emits event", async () => {
    const now = await time.latest();
    const activation = now + 3600;

    // set first
    await module.connect(owner1).setBeneficiary(beneficiary.address, activation);

    // remove
    await expect(module.connect(owner1).removeBeneficiary())
      .to.emit(module, "BeneficiarySet")
      .withArgs(owner1.address, ethers.ZeroAddress);

    // config cleared
    const cfg = await module.heirConfigs(owner1.address);
    expect(cfg.beneficiary).to.equal(ethers.ZeroAddress);
    expect(cfg.activationTime).to.equal(0);
  });

  it("removeBeneficiary for one owner does not affect other owners", async () => {
    const now = await time.latest();
    const t1 = now + 3600;
    const t2 = now + 7200;

    await module.connect(owner1).setBeneficiary(beneficiary.address, t1);
    await module.connect(owner2).setBeneficiary(beneficiary2.address, t2);

    await module.connect(owner1).removeBeneficiary();

    const cfg1 = await module.heirConfigs(owner1.address);
    const cfg2 = await module.heirConfigs(owner2.address);

    expect(cfg1.beneficiary).to.equal(ethers.ZeroAddress);
    expect(cfg1.activationTime).to.equal(0);

    expect(cfg2.beneficiary).to.equal(beneficiary2.address);
    expect(cfg2.activationTime).to.equal(t2);
  });

  it("owner can set a new beneficiary again after removal", async () => {
    const now = await time.latest();
    const t1 = now + 3600;

    await module.connect(owner1).setBeneficiary(beneficiary.address, t1);
    await module.connect(owner1).removeBeneficiary();

    const t2 = t1 + 3600;
    await expect(
      module.connect(owner1).setBeneficiary(beneficiary2.address, t2)
    )
      .to.emit(module, "BeneficiarySet")
      .withArgs(owner1.address, beneficiary2.address);

    const cfg = await module.heirConfigs(owner1.address);
    expect(cfg.beneficiary).to.equal(beneficiary2.address);
    expect(cfg.activationTime).to.equal(t2);
  });

});
