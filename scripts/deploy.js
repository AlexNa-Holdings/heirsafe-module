async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying from:", deployer.address);

  const HairsafeModule = await ethers.getContractFactory("HairsafeModule");
  const module = await HairsafeModule.deploy("YOUR_SAFE_ADDRESS_HERE", "BENEFICIARY_ADDRESS_HERE", 157680000);  // 5 years
  await module.deployed();

  console.log("HairsafeModule deployed to:", module.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});