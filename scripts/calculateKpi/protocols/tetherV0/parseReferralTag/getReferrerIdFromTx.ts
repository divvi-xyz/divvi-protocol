import { Hex } from 'viem'
import { NetworkId } from '../../../../types'
import { getViemPublicClient } from '../../../../utils'
import { getTransactionInfo, TransactionInfo } from './getTransactionInfo'
import { parseReferral, ParseReferralParams } from './parseReferral'

export async function getReferrerIdFromTx(
  txHash: Hex,
  networkId: NetworkId,
  skipRetries: boolean,
  transactionInfo?: TransactionInfo,
): Promise<null | string> {
  if (!transactionInfo) {
    const publicClient = getViemPublicClient(networkId)
    try {
      transactionInfo = await getTransactionInfo({
        publicClient,
        txHash,
        skipRetries,
      })
    } catch (error) {
      return null
    }
  }

  const userOperation =
    transactionInfo.transactionType === 'account-abstraction-bundle'
      ? transactionInfo.userOperations[0]
      : undefined
  const parseReferralParams: ParseReferralParams = userOperation
    ? {
        data: userOperation.calldata,
        user: userOperation.sender,
      }
    : {
        data: transactionInfo.calldata,
        user: transactionInfo.from,
      }

  const { referral } = parseReferral(parseReferralParams)

  if (referral) {
    return referral.consumer
  }

  return null
}
