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

And deploy in another:

```
# Copy-paste environment definition
SHELL=true yarn --silent hardhat --network hardhat run scripts/deploy.ts
# or use eval
eval `SHELL=true yarn --silent hardhat --network hardhat run scripts/deploy.ts`
```

And create some dummy data:

```
yarn hardhat --network hardhat run scripts/setupTestnet.ts
```

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

To deploy, run:

```bash
yarn hardhat run scripts/deploy.ts --network celo
```

After this is done, you should see output in your terminal with a command to run to verify the contract on the block explorers.
