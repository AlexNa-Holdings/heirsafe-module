const { ethers } = require("hardhat");

async function main() {
  const FACTORY = process.env.FACTORY;      // HeirSafeModuleFactory address
  const SAFE    = process.env.SAFE;         // Safe address
  const SALTHEX = process.env.SALT || "0x" + "00".repeat(32);

  if (!FACTORY || !SAFE) throw new Error("Set FACTORY and SAFE env vars");

  const factory = await ethers.getContractAt("HeirSafeModuleFactory", FACTORY);

  // Predict address
  const predicted = await factory.predict(SAFE, SALTHEX);
  console.log("Predicted module:", predicted);

  // Deploy (reverts if already deployed)
  const tx = await factory.deploy(SAFE, SALTHEX);
  const rc = await tx.wait();
  console.log("Deployed tx:", rc?.hash);
  console.log("Module should be at:", predicted);

  // (Optional) sanity check: read avatar()
  const modAbi = ["function avatar() view returns (address)"];
  const mod = new ethers.Contract(predicted, modAbi, ethers.provider);
  console.log("avatar():", await mod.avatar());
}

main().catch((e) => { console.error(e); process.exit(1); });
