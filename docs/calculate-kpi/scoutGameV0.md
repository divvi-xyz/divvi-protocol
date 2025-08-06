[**Divvi Protocol - KPI calculation functions**](README.md)

---

[Divvi Protocol - KPI calculation functions](README.md) / scoutGameV0

# scoutGameV0

## Variables

### calculateKpi

```ts
const calculateKpi: CalculateKpiFn<ScoutGameBreakdown>
```

Defined in: [scoutGameV0.ts:50](https://github.com/divvi-xyz/divvi-protocol/blob/main/scripts/calculateKpi/protocols/scoutGameV0.ts#L50)

Calculates transaction count for Scout Game V0 user engagement tracking.

**KPI Unit**: Transaction count (number of transactions)

**Business Purpose**: Measures the number of transactions initiated by a specific user across multiple
networks supported by Scout Game V0. This metric quantifies user engagement and activity level
with the Scout Game ecosystem, supporting user behavior analysis and engagement tracking.

**Protocol Context**: Scout Game V0 is a gamified platform that tracks and rewards user activity
across multiple blockchain networks. Transaction count serves as a key metric for measuring user
participation and engagement with the Scout Game ecosystem and supported protocols.

**Supported Networks**: Base, Celo, Polygon

**Data Sources**:

- **HyperSync**: Transaction data from Base, Celo, and Polygon networks via HyperSync clients
- **Block Data**: Timestamps via `getBlockRange` utility for temporal filtering across all networks

**Business Assumptions**:

- Transaction count accurately represents user engagement across supported networks
- All user-initiated transactions contribute equally to engagement metrics regardless of network or value
- Cross-network transaction aggregation provides comprehensive view of user activity
- Higher transaction counts indicate more active participation in the Scout Game ecosystem
- Both successful and failed transactions represent legitimate user engagement attempts

**Activity Types**: Token transfers, DeFi interactions, NFT transactions, smart contract calls, and protocol usage

**Calculation Method**:

1. Iterates through all supported networks (Base, Celo, Polygon)
2. For each network, queries all transactions initiated by user wallet within the time window
3. Filters transactions by block timestamp to ensure they fall within the specified time range
4. Aggregates transaction counts across all networks
5. Returns total cross-network transaction count representing user's Scout Game engagement

#### Param

Calculation parameters

#### Param

User wallet address to calculate transaction count for

#### Param

Start of time window for transaction counting (inclusive)

#### Param

End of time window for transaction counting (exclusive)

#### Returns

Promise resolving to total number of transactions across all supported networks
