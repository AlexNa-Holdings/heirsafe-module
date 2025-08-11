const { ethers } = require("hardhat");

async function main() {
  // --- config ---
  const SAFE_ADDRESS = "0xb3d0D01FDCA7E78b7583aFf7010E5b40AA1c0bC2"; // your Safe address here

  console.log("Deploying HeirSafeModule to Sepolia...");
  const HeirSafeModule = await ethers.getContractFactory("HeirSafeModule");
  const module = await HeirSafeModule.deploy();
  await module.waitForDeployment();

  const moduleAddr = await module.getAddress();
  console.log(`Module deployed at: ${moduleAddr}`);

  // Encode init params for setUp(bytes)
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const initParams = abiCoder.encode(["address"], [SAFE_ADDRESS]);

  // Call setUp
  const tx = await module.setUp(initParams);
  await tx.wait();
  console.log(`Module initialized for Safe: ${SAFE_ADDRESS}`);

  console.log("Done!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
