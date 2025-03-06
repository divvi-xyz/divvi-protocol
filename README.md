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

### Fetch Referrals

Fetch referrals for a specific protocol, removes duplicate events across chains, and filters out events where the user was previously exposed to the protocol

```bash
yarn ts-node ./scripts/fetch-referrals.ts --protocol Beefy --output output.csv
```

### Referrer User Count

Fetch the count of users referred for a specific protocol. If no network IDs or referrer IDs are passed, get the user count for all referrers across all supported networks for that protocol.

```bash
# networkIds is optional
yarn ts-node ./scripts/referrerUserCount.ts --protocol Beefy --referrerIds app1 app2 app3 --networkIds celo-mainnet base-mainnet
```

## Contracts

This repository contains the contract(s) necessary to support the Divvi protocol v0.

| Network     | Registry Contract                                                                                                                  | Multisig Address                                                                                                                          |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Arbitrum    | [`0xBa9655677f4E42DD289F5b7888170bC0c7dA8Cdc`](https://arbiscan.io/address/0xBa9655677f4E42DD289F5b7888170bC0c7dA8Cdc)             | [`0xfC95675a6bB93406C0CbBa9403a084Dd8D566F06`](https://app.safe.global/home?safe=arb1:0xfC95675a6bB93406C0CbBa9403a084Dd8D566F06)         |
| Base        | [`0xBa9655677f4E42DD289F5b7888170bC0c7dA8Cdc`](https://basescan.org/address/0xba9655677f4e42dd289f5b7888170bc0c7da8cdc)            | [`0xfC95675a6bB93406C0CbBa9403a084Dd8D566F06`](https://app.safe.global/home?safe=base:0xfC95675a6bB93406C0CbBa9403a084Dd8D566F06)         |
| Berachain   | [`0x5Ac8EB3Bfcb40daF6a209779Ac8643075222285f`](https://berascan.com/address/0x5Ac8EB3Bfcb40daF6a209779Ac8643075222285f)            | [`0xBdae4f72Dbc36Eef3772F5cdDFB9DCbD88bF22BD`](https://safe.berachain.com/home?safe=berachain:0xBdae4f72Dbc36Eef3772F5cdDFB9DCbD88bF22BD) |
| Celo        | [`0xBa9655677f4E42DD289F5b7888170bC0c7dA8Cdc`](https://celoscan.io/address/0xba9655677f4e42dd289f5b7888170bc0c7da8cdc)             | [`0xfC95675a6bB93406C0CbBa9403a084Dd8D566F06`](https://app.safe.global/home?safe=celo:0xfC95675a6bB93406C0CbBa9403a084Dd8D566F06)         |
| Ethereum    | [`0xBa9655677f4E42DD289F5b7888170bC0c7dA8Cdc`](https://etherscan.io/address/0xBa9655677f4E42DD289F5b7888170bC0c7dA8Cdc)            | [`0xfC95675a6bB93406C0CbBa9403a084Dd8D566F06`](https://app.safe.global/home?safe=eth:0xfC95675a6bB93406C0CbBa9403a084Dd8D566F06)          |
| Optimism    | [`0xBa9655677f4E42DD289F5b7888170bC0c7dA8Cdc`](https://optimistic.etherscan.io/address/0xba9655677f4e42dd289f5b7888170bc0c7da8cdc) | [`0xfC95675a6bB93406C0CbBa9403a084Dd8D566F06`](https://app.safe.global/home?safe=oeth:0xfC95675a6bB93406C0CbBa9403a084Dd8D566F06)         |
| Polygon PoS | [`0xBa9655677f4E42DD289F5b7888170bC0c7dA8Cdc`](https://polygonscan.com/address/0xBa9655677f4E42DD289F5b7888170bC0c7dA8Cdc)         | [`0xfC95675a6bB93406C0CbBa9403a084Dd8D566F06`](https://app.safe.global/home?safe=matic:0xfC95675a6bB93406C0CbBa9403a084Dd8D566F06)        |
| Vana        | [`0x2C9403cdCfb51E03fa04131cEBF9E686a7a48A30`](https://vanascan.io/address/0x0)                                                    | [`0xFc273c89EE7570Fa154091ca6068683Af2293cF7`](https://safe.vana.org/home?safe=vana:0xFc273c89EE7570Fa154091ca6068683Af2293cF7)           |

### Deployment Process

We use [OpenZeppelin Defender](https://www.openzeppelin.com/defender) to manage deployments on Mainnet. Before beginning a deployment, make sure that your `.env` file is set up correctly. Namely, make sure to get the `DEFENDER_API_KEY`, `DEFENDER_API_SECRET`, `CELOSCAN_API_KEY` values from GSM and copy them in. (Ideally we could inject these config values into Hardhat automatically, but I haven't found a way to do that.)

To deploy, run:

```bash
yarn hardhat run scripts/deploy.ts --network celo
```

After this is done, you should see output in your terminal with a command to run to verify the contract on the block explorers.
