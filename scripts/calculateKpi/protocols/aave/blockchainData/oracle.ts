import memoize from '@github/memoize'
import { Address } from 'viem'
import BigNumber from 'bignumber.js'
import { NetworkId } from '../../../../types'
import { getViemPublicClient } from '../../../../utils'
import { oracleAbi } from '../../../../abis/aave/oracle'

// Fetches USD prices for a list of tokens using an Aave price oracle
export const getUSDPrices = memoize(_getUSDPrices, {
  hash: (...params: Parameters<typeof _getUSDPrices>) => JSON.stringify(params),
})

export async function _getUSDPrices({
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
  const oracleByteCode = await publicClient.getCode({
    address: oracleAddress,
    blockNumber: BigInt(blockNumber),
  })

  const [baseCurrencyUnit, prices] = oracleByteCode
    ? await Promise.all([
        await publicClient.readContract({
          address: oracleAddress,
          abi: oracleAbi,
          functionName: 'BASE_CURRENCY_UNIT',
          blockNumber: BigInt(blockNumber),
        }),
        publicClient.readContract({
          address: oracleAddress,
          abi: oracleAbi,
          functionName: 'getAssetsPrices',
          args: [tokenAddresses],
          blockNumber: BigInt(blockNumber),
        }),
      ])
    : [0n, []]

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
