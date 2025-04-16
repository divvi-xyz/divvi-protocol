import { LogField } from '@envio-dev/hypersync-client'
import { isAddress, pad } from 'viem'
import {
  fonbnkNetworkToNetworkId,
  TRANSFER_TOPIC,
} from '../calculateRevenue/protocols/fonbnk/constants'
import {
  getFonbnkAssets,
  getPayoutWallets,
} from '../calculateRevenue/protocols/fonbnk/helpers'
import { SUPPORTED_FONBNK_NETWORKS } from '../calculateRevenue/protocols/fonbnk/types'
import { ReferralEvent } from '../types'
import { getBlock, getHyperSyncClient } from '../utils'
import { paginateQuery } from '../utils/hypersyncPagination'

export async function filter(event: ReferralEvent): Promise<boolean> {
  if (!isAddress(event.userAddress)) {
    throw new Error(`Invalid user address: ${event.userAddress}`)
  }

  let foundValidTransaction = false
  let transactedBeforeReferral = false

  const fonbnkAssets = await getFonbnkAssets()
  // For each network, create a new hypersync client and get all of the unique payout wallets
  for (const supportedNetwork of SUPPORTED_FONBNK_NETWORKS) {
    const client = getHyperSyncClient(
      fonbnkNetworkToNetworkId[supportedNetwork],
    )
    const networkAssets = fonbnkAssets
      .filter((asset) => asset.network === supportedNetwork)
      .map((asset) => asset.asset)
    const payoutWallets = await Promise.all(
      networkAssets.map((asset) =>
        getPayoutWallets({ fonbnkNetwork: supportedNetwork, asset }),
      ),
    )
    const uniquePayoutWallets = new Set(payoutWallets.flat())

    // For each payout wallet, check that the user not transacted before the referral
    // and for at least one of the payout wallets, the user has transacted
    for (const payoutWallet of uniquePayoutWallets) {
      const query = {
        logs: [
          {
            topics: [
              [TRANSFER_TOPIC],
              [pad(payoutWallet)],
              [pad(event.userAddress)],
            ],
          },
        ],
        transactions: [{ from: [payoutWallet] }],
        fieldSelection: {
          log: [LogField.BlockNumber],
        },
        fromBlock: 0,
      }

      await paginateQuery(client, query, async (response) => {
        for (const transaction of response.data.logs) {
          // Check that the logs contain all necessary fields
          if (transaction.blockNumber) {
            const block = await getBlock(
              fonbnkNetworkToNetworkId[supportedNetwork],
              BigInt(transaction.blockNumber),
            )
            if (block.timestamp >= BigInt(event.timestamp)) {
              foundValidTransaction = true
            }
            transactedBeforeReferral = block.timestamp < BigInt(event.timestamp)
            return true
          }
        }
      })
      if (transactedBeforeReferral) {
        return false
      }
    }
  }
  return foundValidTransaction
}
