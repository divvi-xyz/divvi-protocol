import { NetworkId } from '../../../types'

export async function getReferrerIdFromTx(
  _transactionHash: string,
  _networkId: NetworkId,
): Promise<null | string> {
  // TODO: get divvi referral tag from tx calldata and parse to get referrerId
  return null
}
