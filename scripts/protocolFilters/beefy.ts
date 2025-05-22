import { MatcherFn } from '../types'
import { fetchWithBackoff } from '../utils/fetchWithBackoff'

// The user has to have made at least one transaction on Beefy Finance
// and all transactions have to be after the referral timestamp
export const filter: MatcherFn = async (event) => {
  const transactions = await fetchInvestorTimeline(event.userAddress)
  return (
    transactions.every(
      (transaction) =>
        new Date(transaction.datetime).getTime() > event.timestamp,
    ) && transactions.length > 0
  )
}

export interface BeefyInvestorTransaction {
  datetime: string
  product_key: string
  display_name: string
  chain: string
  is_eol: boolean
  is_dashboard_eol: boolean
  transaction_hash: string | null
  share_to_underlying_price: number
  underlying_to_usd_price: number | null
  share_balance: number
  underlying_balance: number
  usd_balance: number | null
  share_diff: number
  underlying_diff: number
  usd_diff: number | null
}

export async function fetchInvestorTimeline(
  address: string,
): Promise<BeefyInvestorTransaction[]> {
  const url = `https://databarn.beefy.com/api/v1/beefy/timeline?address=${address}`
  const options = {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  }

  const response = await fetchWithBackoff(url, options)

  if (!response.ok) {
    if (response.status === 404) {
      return []
    }
    throw new Error(`Error fetching investor timeline: ${response.statusText}`)
  }

  const data: BeefyInvestorTransaction[] = await response.json()
  return data
}
