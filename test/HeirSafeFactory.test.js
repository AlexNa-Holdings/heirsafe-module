const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("HeirSafeModuleFactory", function () {
  it("predicts and deploys deterministically", async () => {
    const [owner1, owner2] = await ethers.getSigners();

    const SafeMock = await ethers.getContractFactory("SafeMock");
    const safe = await SafeMock.deploy([owner1.address, owner2.address], 1);

    const HeirSafeModule = await ethers.getContractFactory("HeirSafeModule");
    const impl = await HeirSafeModule.deploy();

    const Factory = await ethers.getContractFactory("HeirSafeModuleFactory");
    const factory = await Factory.deploy(await impl.getAddress());

    const salt = "0x" + "00".repeat(32);
    const predicted = await factory.predict(await safe.getAddress(), salt);

    const tx = await factory.deploy(await safe.getAddress(), salt);
    await tx.wait();

    const mod = await ethers.getContractAt("HeirSafeModule", predicted);
    expect(await mod.avatar()).to.equal(await safe.getAddress());

    // deploying again with same (safe, salt) should revert (already deployed)
    await expect(factory.deploy(await safe.getAddress(), salt)).to.be.reverted;
  });
});
