import { Address } from 'viem'
import BigNumber from 'bignumber.js'
import { NetworkId } from '../../../types'
import { getViemPublicClient } from '../../../utils'
import { oracleAbi } from '../../../abis/aave/oracle'

export async function getUSDPrices({
  networkId,
  oracleAddress,
  tokenAddresses,
  blockNumber,
}: {
  networkId: NetworkId
  oracleAddress: Address
  tokenAddresses: Address[]
  blockNumber: number
}): Promise<Map<Address, BigNumber>> {
  const publicClient = getViemPublicClient(networkId)

  // Check if the contract exists at the given block number
  const poolByteCode = await publicClient.getCode({
    address: oracleAddress,
    blockNumber: BigInt(blockNumber),
  })

  const baseCurrencyUnit = poolByteCode
    ? await publicClient.readContract({
        address: oracleAddress,
        abi: oracleAbi,
        functionName: 'BASE_CURRENCY_UNIT',
        blockNumber: BigInt(blockNumber),
      })
    : 0n

  const prices = poolByteCode
    ? await publicClient.readContract({
        address: oracleAddress,
        abi: oracleAbi,
        functionName: 'getAssetsPrices',
        args: [tokenAddresses],
        blockNumber: BigInt(blockNumber),
      })
    : []

  const result = new Map(
    tokenAddresses.map((address, index) => {
      const price =
        prices[index] && baseCurrencyUnit > 0n
          ? new BigNumber(prices[index]).dividedBy(
              new BigNumber(baseCurrencyUnit),
            )
          : new BigNumber(0)
      return [address, price]
    }),
  )

  return result
}
