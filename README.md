# Funding Layer

## Setup

```bash
yarn install
```

## Testing

```bash
yarn test
```

## Local testnet

Run the localtest in one terminal:

```
yarn hardhat node
```

### Registry contract (v0)

Deploy Registry:

```
yarn hardhat --network localhost registry:deploy
```

And create some dummy data:

```
yarn hardhat --network localhost registry:populate
```

### DivviRegistry contract (v1)

Deploy DivviRegistry:

```
yarn hardhat --network localhost divvi-registry:deploy
```

### RewardPool contract

Deploy mock token:

```bash
yarn hardhat mock-token:deploy --network localhost
```

Deploy RewardPool using the deployed mock token address:

```bash
yarn hardhat reward-pool:deploy \
    --network localhost \
    --pool-token 0x5FbDB2315678afecb367f032d93F642f64180aa3 \
    --reward-function 0xa1b2c3d4e5f67890abcdef1234567890abcdef12 \
    --timelock 1767222000
```

> The token address above will match if you deploy the mock token first thing on the fresh Harhat node.

Run Harhdat console:

```
yarn hardhat console --network localhost
```

Use `ethers` in Hardhat console to interact with the contract:

```
const RewardPool = await ethers.getContractFactory("RewardPool")
const rewardPool = await RewardPool.attach('0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0')
await rewardPool.rewardFunctionId()
```

## Creating Safe Transactions Batches

You need to create one batch of transactions per registry contract
address. For example, if Berachain and Vana have different contract
addresses and all other chains share a contract address you would do:

```
yarn ts-node scripts/createSafeTransactionsBatch.ts --input-csv=crm.csv --output-json=others.json --contract-address=0x000...
yarn ts-node scripts/createSafeTransactionsBatch.ts --input-csv=crm.csv --output-json=vana.json --contract-address=0x111...
yarn ts-node scripts/createSafeTransactionsBatch.ts --input-csv=crm.csv --output-json=berachain.json --contract-address=0x222...
```

See [Contracts](#contracts) for Registry contract addresses.

## Scripts

You may want to set the `ALCHEMY_KEY` in .env to avoid getting rate limited by RPC nodes.

### Fetch Referrals

Fetch referrals for a specific protocol, removes duplicate events across chains, and filters out events where the user was previously exposed to the protocol. By default the output file is `<protocol>-referrals.csv`

```bash
$ yarn ts-node ./scripts/fetchReferrals.ts --protocol beefy
Fetching referral events for protocol: beefy
Wrote results to beefy-referrals.csv
```

### Calculate Revenue

Calculates revenue for a list of referrals. By default it directly reads from the output script of fetchReferrals.ts. By default the output file is `<protocol>-revenue.csv`

```bash
$ yarn ts-node ./scripts/calculateRevenue.ts --protocol beefy --startTimestamp 1740013389000 --endTimestamp 1741899467000
Calculating revenue for 0x15B5f5FE55704140ce5057d85c28f8b237c1Bc53 (1/1)
Wrote results to beefy-revenue.csv
```

### Referrer User Count

Fetch the count of users referred for a specific protocol. If no network IDs or referrer IDs are passed, get the user count for all referrers across all supported networks for that protocol.

```bash
# networkIds is optional
yarn ts-node ./scripts/referrerUserCount.ts --protocol Beefy --referrerIds app1 app2 app3 --networkIds celo-mainnet base-mainnet
```

### Example Data Availability Contract Upload

Our example Data Availability contract (located on Op Mainnet at [0x2Bcbfc02AAa1dB9798179902DeE48F268C8DD3CC](https://optimistic.etherscan.io/address/0x2bcbfc02aaa1db9798179902dee48f268c8dd3cc))
tracks the number of Celo transfers users have made over a period of time. The script found in `scripts/dataAvailability/getTokenTransfers.ts` calculates this data for a specified time range
and uploads it to a specified contract. It can be invoked with:

```bash
yarn ts-node scripts/dataAvailability/getTokenTransfers.ts --token-address 0x471EcE3750Da237f93B8E339c536989b8978a438 \
  --network celo-mainnet
  --start-block 34304880
  --end-block 34304900
  --output-file out.csv
  --data-availability-address=<DATA_AVAILABILITY_CONTRACT_ADDRESS>
  --upload
```

Raw objective function data will always be output to `--output-file`. If `--upload` is set, the script will additionally upload the data to the specified contract,
using the account stored in the `MNEMONIC` environment variable.

More context on this script and how it can be used/modified can be found in the [risc0-example](https://github.com/divvi-xyz/risc0-example) repo.

## Contracts

This repository contains the contract(s) necessary to support the Divvi protocol v0.

See [`docs/contracts.md`](docs/contracts.md) for network deployments.

### Deployment Process

We use [OpenZeppelin Defender](https://www.openzeppelin.com/defender) to manage deployments on Mainnet. Before beginning a deployment, make sure that your `.env` file is set up correctly. Namely, make sure to get the `DEFENDER_API_KEY`, `DEFENDER_API_SECRET`, `CELOSCAN_API_KEY` values from GSM and copy them in. (Ideally we could inject these config values into Hardhat automatically, but I haven't found a way to do that.)

To deploy Registry, run:

```bash
yarn hardhat registry:deploy --network celo
```

To deploy DivviRegistry, run:

```bash
yarn hardhat divvi-registry:deploy \
    --network op \
    --use-defender \
    --defender-deploy-salt <SALT> \
    --owner-address <OWNER_ADDRESS>
```

To deploy RewardPool, run:

```bash
yarn hardhat reward-pool:deploy \
    --network celo \
    --use-defender \
    --defender-deploy-salt <SALT> \
    --owner-address <OWNER_ADDRESS> \
    --pool-token <TOKEN_ADDRESS> \
    --manager-address <MANAGER_ADDRESS> \
    --reward-function 0x<GIT_HASH> \
    --timelock <TIMESTAMP> \
```

After this is done, you should see output in your terminal with a command to run to verify the contract on the block explorers.

To upgrade DivviRegistry, run:

```bash
yarn hardhat divvi-registry:upgrade \
    --network op \
    --use-defender \
    --defender-deploy-salt <SALT> \
    --proxy-address <PROXY_ADDRESS>
```

### Metadata of upgradable contracts

Metadata about proxy and implementation deployments is automatically generated and stored in the `.openzeppelin/` directory, which should be checked into version control.
