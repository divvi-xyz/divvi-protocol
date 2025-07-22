import { Hex } from 'viem'
import { NetworkId } from '../../../../types'
import { getViemPublicClient } from '../../../../utils'
import { getTransactionInfo, TransactionInfo } from './getTransactionInfo'
import { parseReferral, ParseReferralParams } from './parseReferral'

export async function getReferrerIdFromTx(
  txHash: Hex,
  networkId: NetworkId,
  skipRetries: boolean,
): Promise<null | string> {
  const publicClient = getViemPublicClient(networkId)

  let transactionInfo: TransactionInfo | null = null
  try {
    transactionInfo = await getTransactionInfo({
      publicClient,
      txHash,
      skipRetries,
    })
  } catch (error) {
    console.warn('No transaction info found for tx', txHash, error)
    return null
  }

  const userOperation =
    transactionInfo.transactionType === 'account-abstraction-bundle'
      ? transactionInfo.userOperations[0]
      : undefined
  const parseReferralParams: ParseReferralParams = userOperation
    ? {
        referralType: 'onchain',
        data: userOperation.calldata,
        user: userOperation.sender,
      }
    : {
        referralType: 'onchain',
        data: transactionInfo.calldata,
        user: transactionInfo.from,
      }

  const { referral, error } = parseReferral(parseReferralParams)

  if (referral) {
    return referral.consumer
  }

  console.warn('No referral found for tx', txHash, error)
  return null
}
