import { NetworkId } from '../../../types'
import beefyVaultV7Abi from '../../../abis/BeefyVaultV7'
import aerodromeLiquidtyPoolAbi from '../../../abis/AerodromeLiquidityPool'
import stratFeeManagerAbi from '../../../abis/StratFeeManagerInitializable'
import { getViemPublicClient } from '../../../utils'
import { getContract, Address } from 'viem'

/**
 * For a given vault, returns a contract object representing the strategy
 * contract associated with it.
 */
export async function getStrategyContract(
  vaultAddress: Address,
  networkId: NetworkId,
) {
  const client = getViemPublicClient(networkId)
  const vaultContract = getContract({
    address: vaultAddress,
    abi: beefyVaultV7Abi,
    client,
  })
  const strategyAddress = await vaultContract.read.strategy()
  return getContract({
    address: strategyAddress,
    abi: stratFeeManagerAbi,
    client,
  })
}

/**
 * For a given liquidity pool, returns a contract object.
 */
export async function getAerodromeLiquidityPoolContract(
  liquidityPoolAddress: Address,
  networkId: NetworkId,
) {
  const client = getViemPublicClient(networkId)
  return getContract({
    address: liquidityPoolAddress,
    abi: aerodromeLiquidtyPoolAbi,
    client,
  })
}
