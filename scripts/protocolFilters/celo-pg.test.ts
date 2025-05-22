import { Address } from 'viem'
import { ReferralEvent } from '../types'
import { filter } from './celo-pg'

describe('filter', () => {
  const event = {
    userAddress: '0x123',
    timestamp: 1234567890,
    referrerId: '0x456',
    protocol: 'celo-pg',
  } as ReferralEvent

  it('returns true if no excludeList is passed in', async () => {
    const result = await filter(event)
    expect(result).toBe(true)
  })

  it('returns true if referrerId is not in excludeList', async () => {
    const excludeList: Address[] = ['0x789', '0xabc']
    const result = await filter(event, { excludeList })
    expect(result).toBe(true)
  })

  it('returns false if referrerId is in excludeList', async () => {
    const excludeList: Address[] = ['0x456', '0xabc']
    const result = await filter(event, { excludeList })
    expect(result).toBe(false)
  })

  it('throws if referrerId is in excludeList and failOnExclude is true', async () => {
    const excludeList: Address[] = ['0x456', '0xabc']
    await expect(
      filter(event, { excludeList, failOnExclude: true }),
    ).rejects.toThrow(/is in the exclude list/)
  })

  it('returns true if referrerId is not in excludeList and failOnExclude is true', async () => {
    const excludeList: Address[] = ['0x789', '0xabc']
    const result = await filter(event, { excludeList, failOnExclude: true })
    expect(result).toBe(true)
  })

  it('logs a warning if referrerId is in excludeList and failOnExclude is falsy', async () => {
    const excludeList: Address[] = ['0x456', '0xabc']
    const warnSpy = jest.spyOn(console, 'warn')
    await filter(event, { excludeList })
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('is in the exclude list'),
    )
    warnSpy.mockRestore()
  })
})
