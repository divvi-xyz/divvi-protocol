[**Divvi Protocol - KPI calculation functions**](README.md)

---

[Divvi Protocol - KPI calculation functions](README.md) / tetherV0

# tetherV0

## Functions

### calculateKpi()

```ts
function calculateKpi(params): Promise<KpiResults>
```

Defined in: [tetherV0/index.ts:222](https://github.com/divvi-xyz/divvi-protocol/blob/main/scripts/calculateKpi/protocols/tetherV0/index.ts#L222)

Calculates eligible transaction count for Tether (USDT) activity across multiple networks.

**KPI Unit**: Transaction count (number of eligible transactions) where the net transfer value is >= 1 USDT or USDT0

**Business Purpose**: Measures the volume of significant Tether (USDT) transactions to or from a specific user
across multiple blockchain networks. This metric quantifies user engagement with the Tether ecosystem and
supports analysis of stablecoin usage patterns and cross-chain activity.

**Protocol Context**: Tether V0 tracks transaction volume to measure user participation in the stablecoin
ecosystem across various networks. Transaction counts serve as a proxy for user engagement and economic
activity, supporting stablecoin adoption analysis and cross-chain usage patterns.

**Networks**: Ethereum Mainnet, Avalanche Mainnet, Celo Mainnet, Unichain Mainnet, Ink Mainnet,
Optimism Mainnet, Arbitrum One, Berachain Mainnet

**Data Sources**:

- **HyperSync**: Transfer event data from USDT and USDT0 token contracts on multiple networks via HyperSync client
- **Block Data**: Timestamps via `getBlockRange` utility for temporal filtering

**Business Assumptions**:

- Transactions with net value >= 1 USDT or USDT0 (1,000,000 smallest units) are considered significant
- User's economic impact is proportional to the number of eligible transactions across all networks
- Both incoming and outgoing transfers contribute to user activity measurement

**Eligibility Criteria**:

- Transactions must have a net transfer value (incoming - outgoing) >= 1 USDT or USDT0
- Transactions must fall within the specified time window

**Calculation Method**:

1. Queries all transactions initiated by user wallet across all supported networks
2. Retrieves Transfer events from official Tether token contracts for each network
3. Calculates net transfer value per transaction (incoming - outgoing transfers)
4. Filters transactions by minimum value threshold (1 USDT)
5. Aggregates eligible transaction counts across all networks
6. Returns total count representing user's significant Tether activity

#### Parameters

##### params

Calculation parameters

###### address

`string`

User wallet address to calculate transaction count for

###### endTimestampExclusive

`Date`

End of time window for calculation (exclusive)

###### getReferrerIdFromTx?

(`transactionHash`, `networkId`) => `Promise`\<`null` \| `string`\>

###### redis?

`RedisClientType`

Optional Redis client for caching block ranges

###### startTimestamp

`Date`

Start of time window for calculation (inclusive)

#### Returns

`Promise`\<`KpiResults`\>

Promise resolving to KPI results grouped by referrer ID with per-network breakdown
