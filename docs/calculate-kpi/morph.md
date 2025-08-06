[**Divvi Protocol - KPI calculation functions**](README.md)

---

[Divvi Protocol - KPI calculation functions](README.md) / morph

# morph

## Functions

### calculateKpi()

```ts
function calculateKpi(params): Promise<KpiResult<string>>
```

Defined in: [morph/index.ts:45](https://github.com/divvi-xyz/divvi-protocol/blob/main/scripts/calculateKpi/protocols/morph/index.ts#L45)

Calculates the number of transactions for a given user on the Morph network.

**KPI Unit**: Number of transactions

**Business Purpose**: Measures the number of transactions for a given user on the Morph network.
This metric quantifies the user's activity on the network and supports network utilization analysis.

**Protocol Context**: Morph is the consumer finance layer of the internet, powering real-world payments,
rewards, and savings. Built for the growing digital class shaping the internet economy.

**Network**: Morph Mainnet

**Data Sources**:

- **HyperSync**: Transaction and gas usage data from Morph network via HyperSync client
- **Block Data**: Timestamps via `getBlockRange` utility for temporal filtering

**Business Assumptions**:

- Transaction count accurately represents user engagement with the network
- All user-initiated transactions contribute equally to activity metrics regardless of value or purpose
- Higher transaction counts indicate more active user participation in the ecosystem
- Transaction frequency serves as a proxy for user adoption and platform utility
- Both successful and failed transactions represent legitimate user engagement attempts

**Transaction Types**: Token transfers, smart contract interactions, DeFi protocol usage, and dApp engagement

**Calculation Method**:

1. Queries all transactions initiated by user wallet within the specified time window on Morph
2. Filters transactions by block timestamp to ensure they fall within the time range
3. Counts the total number of transactions regardless of success status or transaction value
4. Returns total transaction count representing user's network engagement level

#### Parameters

##### params

Calculation parameters

###### address

`string`

User wallet address to calculate transaction count for

###### endTimestampExclusive

`Date`

End of time window for transaction counting (exclusive)

###### redis?

`RedisClientType`

###### startTimestamp

`Date`

Start of time window for transaction counting (inclusive)

#### Returns

`Promise`\<`KpiResult`\<`string`\>\>

Promise resolving to total number of transactions initiated by the user
