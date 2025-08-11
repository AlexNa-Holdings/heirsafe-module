
# HeirSafe Module

On-chain inheritance for **Safe** (Gnosis Safe) wallets — implemented as a Safe **module**.

Each Safe **owner** can configure a personal **beneficiary** and an **activation time** (UTC seconds).  
After the time passes, the beneficiary can **claim** to replace that owner’s address on the Safe.  
No funds move; only the owner slot changes. Safe threshold/policy remains unchanged.

- UI: https://github.com/AlexNa-Holdings/heirsafe-ui
- Module: https://github.com/AlexNa-Holdings/heirsafe-module

---

## What it does

- Per-owner configuration:
  - `beneficiary`: who can inherit that owner’s slot
  - `activationTime`: unix timestamp after which claiming is allowed
- Owners can **set**, **prolong**, or **remove** their configuration until claimed.
- The configured beneficiary can **claim** after `activationTime` to replace the owner.
- The module must be **enabled** on the Safe to operate.

> The module **does not move assets** and **does not change the Safe’s threshold**.

---

## Contracts (overview)

- **`HeirSafeModule`** – stores per-owner configs and performs owner replacement on valid claim.
- **`HeirSafeFactory`** – deploys module instances at **deterministic** addresses (e.g., via CREATE2) per Safe + salt.

_Minimal external interface (sketch):_
```solidity
interface IHeirSafeModule {
  struct HeirConfig { address beneficiary; uint256 activationTime; }

  function heirConfigs(address owner) external view returns (HeirConfig memory);

  // Owner (the Safe owner EOA) actions:
  function setBeneficiary(address beneficiary, uint256 activationTime) external;
  function setActivationTime(uint256 activationTime) external;

  // Beneficiary action (after time):
  // `owner` is the owner to replace; `prevOwner` is required by Safe for its linked list
  function claimSafe(address owner, address prevOwner) external;

  event HeirSet(address indexed owner, address indexed beneficiary, uint256 activationTime);
  event HeirClaimed(address indexed owner, address indexed beneficiary, uint256 at);
}
````

---

## Deterministic deployment (high level)

1. **Choose a 32-byte salt** (stable for your project): `0x` + 64 hex chars.
2. **Predict** the module address off-chain using `FACTORY + salt + initCodeHash` (UI provides this).
3. **Deploy** via the factory for the target Safe and salt.
4. **Enable** the module on the Safe (`enableModule(predictedAddress)`).
5. **Owners** set or update their heir configs.
6. **Beneficiary** claims after time using `claimSafe(owner, prevOwner)` (UI computes `prevOwner`).

---

## Develop

This repo contains Solidity contracts. You can use **Foundry** or **Hardhat**.

### Using Foundry

```bash
# install foundryup: https://book.getfoundry.sh/getting-started/installation
foundryup

# deps
forge install

# build
forge build

# test
forge test -vv

# (example) deploy script
forge script script/DeployFactory.s.sol \
  --rpc-url $RPC --private-key $PK --broadcast
```

### Using Hardhat

```bash
# deps
npm i        # or: pnpm i / yarn

# compile
npx hardhat compile

# test
npx hardhat test

# (example) deploy
npx hardhat run scripts/deploy-factory.ts --network <your-network>
```

---

## Usage notes

* Timestamps on-chain are **UTC seconds**. Frontends may collect local time, then convert to UTC seconds before sending.
* Removing a config: set `beneficiary = address(0)` and `activationTime = 0`.
* Safe owner updates require `prevOwner` for the linked-list; compute off-chain carefully (the UI handles this).

---

## Security considerations

* **Authorization**

  * Only the **owner** can set/change their own heir configuration.
  * Only the configured **beneficiary** can claim after `activationTime`.
* **Owner list updates**

  * Make sure `prevOwner` is correct; an incorrect value will cause a revert.
* **No asset movement**

  * The module never transfers assets; it updates owner addresses via Safe’s module mechanism.
* **Review / audit**

  * This affects wallet control. Thoroughly review and consider audits before production use.

---

## License

**GNU General Public License v3.0** — see [LICENSE](./LICENSE).

---

## Author

**Written by [Alex Na](https://x.com/AlexNa)**

* UI: [https://github.com/AlexNa-Holdings/heirsafe-ui](https://github.com/AlexNa-Holdings/heirsafe-ui)
* Module: [https://github.com/AlexNa-Holdings/heirsafe-module](https://github.com/AlexNa-Holdings/heirsafe-module)

```

::contentReference[oaicite:0]{index=0}

