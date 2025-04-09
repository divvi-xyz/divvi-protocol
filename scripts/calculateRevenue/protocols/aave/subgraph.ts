import { gql, GraphQLClient } from 'graphql-request'
import { Address } from 'viem'
import { SUBGRAPH_BASE_URL, THE_GRAPH_API_KEY } from './config'

interface ATokenBalanceHistoryItem {
  timestamp: number
  scaledATokenBalance: string
  index: string
}

interface UserReserve {
  reserve: {
    aToken: {
      id: string
    }
  }
  aTokenBalanceHistory: ATokenBalanceHistoryItem[]
}

interface AaveUserReservesResponse {
  userReserves: UserReserve[]
}

export async function getATokenBalanceHistory({
  subgraphId,
  userAddress,
  startTimestamp,
  endTimestamp,
}: {
  subgraphId: string
  userAddress: Address
  startTimestamp: Date
  endTimestamp: Date
}) {
  const subgraphUrl = new URL(subgraphId, SUBGRAPH_BASE_URL).toString()
  console.log(subgraphUrl)
  const client = new GraphQLClient(subgraphUrl, {
    headers: {
      Authorization: `Bearer ${THE_GRAPH_API_KEY}`,
    },
  })

  const query = gql`
    query getUserReservesHistory(
      $userAddress: String!
      $startTimestamp: Int!
      $endTimestamp: Int!
    ) {
      userReserves(where: { user: $userAddress }) {
        reserve {
          aToken {
            id
          }
        }
        aTokenBalanceHistory(
          where: {
            timestamp_gte: $startTimestamp
            timestamp_lte: $endTimestamp
          }
          orderBy: timestamp
          orderDirection: asc
        ) {
          index
          scaledATokenBalance
          timestamp
        }
      }
    }
  `

  const data = await client.request<AaveUserReservesResponse>(query, {
    userAddress: userAddress.toLowerCase(),
    startTimestamp: Math.floor(startTimestamp.getTime() / 1000),
    endTimestamp: Math.floor(endTimestamp.getTime() / 1000),
  })

  const result = new Map(
    data.userReserves.map((userReserve) => [
      userReserve.reserve.aToken.id.toLowerCase() as Address,
      userReserve.aTokenBalanceHistory.map((historyItem) => ({
        scaledATokenBalance: BigInt(historyItem.scaledATokenBalance),
        liquidityIndex: BigInt(historyItem.index),
        timestamp: historyItem.timestamp,
      })),
    ]),
  )

  return result
}
