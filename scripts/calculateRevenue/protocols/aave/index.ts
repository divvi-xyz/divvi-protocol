import { Address } from 'viem'
import BigNumber from 'bignumber.js'
import { SUPPORTED_NETWORKS, SupportedNetwork } from './config'
import { fetchBlockchainData } from './blockchainData'

export async function calculateRevenue({
  address,
  startTimestamp,
  endTimestampExclusive,
}: {
  address: string
  startTimestamp: Date
  endTimestampExclusive: Date
}): Promise<number> {
  let revenue = new BigNumber(0)

  for (const network of SUPPORTED_NETWORKS) {
    revenue = revenue.plus(
      await revenueInNetwork(
        network,
        address as Address,
        startTimestamp,
        endTimestampExclusive,
      ),
    )
  }

  return revenue.toNumber()
}

export async function revenueInNetwork(
  network: SupportedNetwork,
  userAddress: Address,
  startTimestamp: Date,
  endTimestampExclusive: Date,
): Promise<BigNumber> {
  const chainData = await fetchBlockchainData(
    network,
    userAddress,
    startTimestamp,
    endTimestampExclusive,
  )

  // TODO: Implement revenue calculation logic
  console.log('chainData', chainData)

  return new BigNumber(0)
}
