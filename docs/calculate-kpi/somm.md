[**Divvi Protocol - KPI calculation functions**](README.md)

---

[Divvi Protocol - KPI calculation functions](README.md) / somm

# somm

## Functions

### calculateKpi()

```ts
function calculateKpi(params): Promise<KpiResult<string>>
```

Defined in: [somm/index.ts:217](https://github.com/divvi-xyz/divvi-protocol/blob/main/scripts/calculateKpi/protocols/somm/index.ts#L217)

Calculates reward allocation based on user's time-weighted TVL in Sommelier protocol.

**KPI Unit**: USD (United States Dollars)

**Business Purpose**: Measures the reward allocation for a specific user based on their
time-weighted TVL across Sommelier strategy vaults. This metric quantifies the user's
proportional participation in Sommelier's active yield strategies and determines their
reward share.

**Protocol Context**: Sommelier is a decentralized asset management platform that runs active yield
strategies on Ethereum. Users are rewarded based on their time-weighted TVL in the protocol's
strategy vaults.

**Network**: Ethereum Mainnet (and networks where Sommelier has deployed strategy vaults)

**Data Sources**:

- **Sommelier API**: Strategy vault data, performance metrics, and metadata from Sommelier's API
- **RPC Queries**: User deposit/withdrawal events via Viem public client calls to strategy vault contracts
- **Token Price API**: Historical token prices via `fetchTokenPrices` utility for USD conversion
- **Block Data**: Timestamps via `getBlockRange` utility for temporal filtering
- **Vault Contracts**: Time-weighted TVL calculations and share price data from strategy vault contracts

**Business Assumptions**:

- Reward rate is 10% of user's time-weighted TVL
- Reward attribution is proportional to user's time-weighted deposits within strategy vaults
- USD conversion uses token prices at time of each transaction for accuracy
- Only active strategy vaults are included in calculations
- Reward distribution follows time-weighted calculation based on vault share ownership

**Reward Structure**: 10% of time-weighted TVL (standard reward rate for protocol participation)

**Calculation Method**:

1. Retrieves active strategy vault configurations from Sommelier API
2. Filters vaults by Ethereum network and active status
3. For each vault, queries user's deposit/withdrawal events within time window
4. Calculates user's time-weighted share of vault deposits using share price history
5. Applies 10% reward rate to user's proportional vault activity
6. Converts to USD using historical token prices at transaction timestamps
7. Aggregates rewards across all strategy vaults for total allocation

#### Parameters

##### params

Calculation parameters

###### address

`string`

User wallet address to calculate rewards for

###### endTimestampExclusive

`Date`

End of time window for reward calculation (exclusive)

###### startTimestamp

`Date`

Start of time window for reward calculation (inclusive)

#### Returns

`Promise`\<`KpiResult`\<`string`\>\>

Promise resolving to total reward allocation in USD
