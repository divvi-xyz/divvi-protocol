# Contracts

## DivviRegistry Contract (v1)

The DivviRegistry contract is upgradable. Both staging and production contracts are deployed on Optimism only.

### Production

Proxy address: [0xEdb51A8C390fC84B1c2a40e0AE9C9882Fa7b7277](https://optimistic.etherscan.io/address/0xEdb51A8C390fC84B1c2a40e0AE9C9882Fa7b7277)

Owner address: [0xE8e569396A7580bb38f0F77685Fd2AA00f6adBA4](https://app.safe.global/home?safe=oeth:0xE8e569396A7580bb38f0F77685Fd2AA00f6adBA4)

## Staging

Proxy address: [0x2f5E320698dB89CbefB810Fa19264103d99aAFB1](https://optimistic.etherscan.io/address/0x2f5E320698dB89CbefB810Fa19264103d99aAFB1)

Owner address: [0xfC95675a6bB93406C0CbBa9403a084Dd8D566F06](https://app.safe.global/home?safe=oeth:0xfC95675a6bB93406C0CbBa9403a084Dd8D566F06)

## Reward Pool Contract

The Reward Pool contracts can be deployed on multiple networks multiple times. E.g. one per specific campaign.

### Staging

List of staging contracts:

| Network | Reward Token  | Proxy address                                                                                                          | Multisig Address (has both Owner and Manager roles)                                                                                    |
| ------- | ------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Celo    | CELO (native) | [`0xecd6580636d0c7c93f60892daabd96af3a17e37b`](https://celoscan.io/address/0xecd6580636d0c7c93f60892daabd96af3a17e37b) | [`0xfC95675a6bB93406C0CbBa9403a084Dd8D566F06`](https://app.safe.global/home?safe=celo:celo:0xfC95675a6bB93406C0CbBa9403a084Dd8D566F06) |

## RewardPoolFactory Contract

The RewardPoolFactory contract is upgradeable; it is currently deployed on the following networks.

| Network  | Proxy address                                                                                                                  | Multisig Address (has Owner role)                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Base     | [`0xBF90d4BCbb74a5a58D6F8A31649D379E185F927C`](https://basescan.org/address/0xBF90d4BCbb74a5a58D6F8A31649D379E185F927C)        | [`0xE8e569396A7580bb38f0F77685Fd2AA00f6adBA4`](https://app.safe.global/home?safe=base:0xE8e569396A7580bb38f0F77685Fd2AA00f6adBA4)  |
| Ethereum | [`0x1C4f9b95016F0910f0489bC7Bd8b90EC0A51E417`](https://etherscan.io/address/0x1C4f9b95016F0910f0489bC7Bd8b90EC0A51E417)        | [`0xE8e569396A7580bb38f0F77685Fd2AA00f6adBA4`](https://app.safe.global/home?safe=eth:0xE8e569396A7580bb38f0F77685Fd2AA00f6adBA4)   |
| Mantle   | [`0xae633CF7A483C136cb8Eac7Efaa3382786E49D9D`](https://mantlescan.xyz/address/0xae633CF7A483C136cb8Eac7Efaa3382786E49D9D)      | [`0xBB6b913CE4E7c857EAe9ecd7Bf4912ee0578777A`](https://app.safe.global/home?safe=mnt:0xBB6b913CE4E7c857EAe9ecd7Bf4912ee0578777A)   |
| Celo     | [`0x050359Da93228833F291788b7DE355CE97217CEB`](https://celoscan.io/address/0x050359Da93228833F291788b7DE355CE97217CEB)         | [`0xE8e569396A7580bb38f0F77685Fd2AA00f6adBA4`](https://app.safe.global/home?safe=celo:0xE8e569396A7580bb38f0F77685Fd2AA00f6adBA4)  |
| Morph    | [`0xcF2D6173FBE0Fb9246327e946B2CC6ADBa67c2dE`](https://explorer.morphl2.io/address/0xcF2D6173FBE0Fb9246327e946B2CC6ADBa67c2dE) | [`0x46e9B2B7749b1359C1025Db41755De31E3029825`](https://safe.morphl2.io/home?safe=morph:0x46e9B2B7749b1359C1025Db41755De31E3029825) |

## Registry Contract (v0) -- Deprecated

The Registry contract is deployed on all supported networks. The contract and owner addresses can be found below for each network.

| Network     | Registry Contract                                                                                                                  | Multisig Address                                                                                                                       |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Arbitrum    | [`0xBa9655677f4E42DD289F5b7888170bC0c7dA8Cdc`](https://arbiscan.io/address/0xBa9655677f4E42DD289F5b7888170bC0c7dA8Cdc)             | [`0xfC95675a6bB93406C0CbBa9403a084Dd8D566F06`](https://app.safe.global/home?safe=arb1:0xfC95675a6bB93406C0CbBa9403a084Dd8D566F06)      |
| Base        | [`0xBa9655677f4E42DD289F5b7888170bC0c7dA8Cdc`](https://basescan.org/address/0xba9655677f4e42dd289f5b7888170bc0c7da8cdc)            | [`0xfC95675a6bB93406C0CbBa9403a084Dd8D566F06`](https://app.safe.global/home?safe=base:0xfC95675a6bB93406C0CbBa9403a084Dd8D566F06)      |
| Berachain   | [`0x5Ac8EB3Bfcb40daF6a209779Ac8643075222285f`](https://berascan.com/address/0x5Ac8EB3Bfcb40daF6a209779Ac8643075222285f)            | [`0xfC95675a6bB93406C0CbBa9403a084Dd8D566F06`](https://app.safe.global/apps?safe=berachain:0xfC95675a6bB93406C0CbBa9403a084Dd8D566F06) |
| Celo        | [`0xBa9655677f4E42DD289F5b7888170bC0c7dA8Cdc`](https://celoscan.io/address/0xba9655677f4e42dd289f5b7888170bc0c7da8cdc)             | [`0xfC95675a6bB93406C0CbBa9403a084Dd8D566F06`](https://app.safe.global/home?safe=celo:0xfC95675a6bB93406C0CbBa9403a084Dd8D566F06)      |
| Ethereum    | [`0xBa9655677f4E42DD289F5b7888170bC0c7dA8Cdc`](https://etherscan.io/address/0xBa9655677f4E42DD289F5b7888170bC0c7dA8Cdc)            | [`0xfC95675a6bB93406C0CbBa9403a084Dd8D566F06`](https://app.safe.global/home?safe=eth:0xfC95675a6bB93406C0CbBa9403a084Dd8D566F06)       |
| Optimism    | [`0xBa9655677f4E42DD289F5b7888170bC0c7dA8Cdc`](https://optimistic.etherscan.io/address/0xba9655677f4e42dd289f5b7888170bc0c7da8cdc) | [`0xfC95675a6bB93406C0CbBa9403a084Dd8D566F06`](https://app.safe.global/home?safe=oeth:0xfC95675a6bB93406C0CbBa9403a084Dd8D566F06)      |
| Polygon PoS | [`0xBa9655677f4E42DD289F5b7888170bC0c7dA8Cdc`](https://polygonscan.com/address/0xBa9655677f4E42DD289F5b7888170bC0c7dA8Cdc)         | [`0xfC95675a6bB93406C0CbBa9403a084Dd8D566F06`](https://app.safe.global/home?safe=matic:0xfC95675a6bB93406C0CbBa9403a084Dd8D566F06)     |
| Vana        | [`0xbd40663C4b3bcf4AE4Ca60364ef98612bDe5c675`](https://vanascan.io/address/0xbd40663C4b3bcf4AE4Ca60364ef98612bDe5c675)             | [`0xFc273c89EE7570Fa154091ca6068683Af2293cF7`](https://safe.vana.org/home?safe=vana:0xFc273c89EE7570Fa154091ca6068683Af2293cF7)        |
