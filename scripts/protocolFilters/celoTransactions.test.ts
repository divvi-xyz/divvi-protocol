import { Address } from 'viem'
import { ReferralEvent } from '../types'
import { filter } from './celoTransactions'

describe('filter', () => {
  const event = {
    userAddress: '0x123',
    timestamp: 1234567890,
    referrerId: '0x456',
    protocol: 'celo-transactions',
  } as ReferralEvent

  it('returns true if referrerId is in builderAllowList', async () => {
    const builderAllowList: Address[] = ['0x456', '0x789']
    const result = await filter(event, builderAllowList)
    expect(result).toBe(true)
  })

  it('returns false if referrerId is not in builderAllowList', async () => {
    const builderAllowList: Address[] = ['0x789', '0xabc']
    const result = await filter(event, builderAllowList)
    expect(result).toBe(false)
  })
})
