const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const HeirSafeModule = await ethers.getContractFactory("HeirSafeModule");
  const impl = await HeirSafeModule.deploy();
  await impl.waitForDeployment();
  console.log("HeirSafeModule implementation:", await impl.getAddress());

  const Factory = await ethers.getContractFactory("HeirSafeModuleFactory");
  const factory = await Factory.deploy(await impl.getAddress());
  await factory.waitForDeployment();
  console.log("HeirSafeModuleFactory:", await factory.getAddress());
}

main().catch((e) => { console.error(e); process.exit(1); });
