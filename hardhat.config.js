// hardhat.config.js
require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/**
 * ENV you’ll want set:
 *  - SEPOLIA_RPC_URL
 *  - MAINNET_RPC_URL
 *  - PULSECHAIN_RPC_URL      (e.g. https://rpc.pulsechain.com)
 *  - TEST_PRIVATE_KEY        (optional, for sepolia)
 *  - PRIVATE_KEY             (deployer key used for mainnet/pulse)
 *  - ETHERSCAN_API_KEY       (for Ethereum verification)
 *  - PULSESCAN_API_KEY       (optional; many Blockscout instances ignore it)
 */

module.exports = {
  solidity: "0.8.20",

  networks: {
    hardhat: {},

    sepolia: {
      url: process.env.SEPOLIA_RPC_URL,
      accounts: process.env.TEST_PRIVATE_KEY
        ? [process.env.TEST_PRIVATE_KEY]
        : [],
      chainId: 11155111,
    },

    mainnet: {
      url: process.env.MAINNET_RPC_URL || "https://eth.llamarpc.com",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 1,
    },

    // PulseChain mainnet
    pulsechain: {
      url: process.env.PULSECHAIN_RPC_URL || "https://rpc.pulsechain.com",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 369,
    },
  },

  // Hardhat Verify supports Etherscan AND Blockscout (via customChains)
  etherscan: {
    apiKey: {
      mainnet: process.env.ETHERSCAN_API_KEY || "",
      // PulseScan is Blockscout-backed; the key is often ignored but plugin expects a value
      pulsechain: process.env.PULSESCAN_API_KEY || "placeholder",
    },
    customChains: [
      {
        network: "pulsechain",
        chainId: 369,
        urls: {
          apiURL: "https://api.scan.pulsechain.com/api",
          browserURL: "https://scan.9inch.io/",
        },
      },
    ],
    sourcify: {
      enabled: true,
    },
  },

  mocha: { timeout: 40000 },
};
