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

### Registry contract

Deploy Registry:

```
yarn hardhat --network localhost registry:deploy
```

And create some dummy data:

```
yarn hardhat --network localhost registry:populate
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

## Contracts

This repository contains the contract(s) necessary to support the Divvi protocol v0.

See [`docs/contracts.md`](docs/contracts.md) for network deployments.

### Deployment Process

We use [OpenZeppelin Defender](https://www.openzeppelin.com/defender) to manage deployments on Mainnet. Before beginning a deployment, make sure that your `.env` file is set up correctly. Namely, make sure to get the `DEFENDER_API_KEY`, `DEFENDER_API_SECRET`, `CELOSCAN_API_KEY` values from GSM and copy them in. (Ideally we could inject these config values into Hardhat automatically, but I haven't found a way to do that.)

To deploy Registry, run:

```bash
yarn hardhat registry:deploy --network celo
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
