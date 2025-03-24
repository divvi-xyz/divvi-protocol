import { Address } from 'viem'
import { NetworkId } from '../../../types'
import { getTvlProratedPerYear } from './index'
import { getEvents } from './getEvents'
import { calculateWeightedAveragePrice } from './dailySnapshots'

jest.mock('viem', () => ({
  ...jest.requireActual('viem'),
  getContract: jest.fn().mockReturnValue({
    read: {
      balanceOf: jest.fn().mockReturnValue(BigInt(100 * 1e18)),
      decimals: jest.fn().mockReturnValue(18),
    },
  }),
}))

jest.mock('./getEvents')
jest.mock('./dailySnapshots')

const vaultInfo = {
  networkId: NetworkId['arbitrum-one'],
  vaultAddress: '0x1234567890123456789012345678901234567890' as Address,
}
const address = '0x1234567890123456789012345678901234567890'

describe('getTvlProratedPerYear', () => {
  it('should throw an error if endTimestamp is in the future', async () => {
    const startTimestamp = new Date('2021-01-0')
    const endTimestamp = new Date('2022-01-01')
    const nowTimestamp = new Date('2021-01-01')
    await expect(
      getTvlProratedPerYear({
        vaultInfo,
        address,
        startTimestamp,
        endTimestamp,
        nowTimestamp,
      }),
    ).rejects.toThrow('Cannot have an endTimestamp in the future')
  })
  it('should return the correct mean TVL', async () => {
    const startTimestamp = new Date('2021-01-05')
    const endTimestamp = new Date('2021-01-20')
    const nowTimestamp = new Date('2021-01-30')
    jest.mocked(calculateWeightedAveragePrice).mockReturnValue(2)
    jest.mocked(getEvents).mockResolvedValueOnce([
      { amount: 50, timestamp: new Date('2021-01-25') }, // a 50 LP token deposit
      { amount: -30, timestamp: new Date('2021-01-15') }, // a 30 LP token withdrawal
      { amount: 20, timestamp: new Date('2021-01-10') }, // a 20 LP token deposit
    ])
    const result = await getTvlProratedPerYear({
      vaultInfo,
      address,
      startTimestamp,
      endTimestamp,
      nowTimestamp,
    })
    // first chuck of time is 5 days with 100 TVL, the current balance. All outside of the range so it isn't counted
    // second chunk of time is 10 days with 50 TVL, only 5 days are in the range so 50 * 5 = 250 TVL days
    // third chunk of time is 5 days with 80 TVL, all 5 days are in the range so 80 * 5 = 400 TVL days
    // fourth chunk of time is 10 days with 60 TVL, only 5 days are in the range so 60 * 5 = 300 TVL days
    // TVL Days = (250 + 400 + 300) = 950 / 365 = 2.602
    // the weighted average price is 2
    // the mean TVL in USD = 2.602 * 2 = 5.204
    expect(result).toBeCloseTo(5.204)
  })
  it('should return the correct mean TVL when there are multiple events on the same day', async () => {
    const startTimestamp = new Date('2025-01-10T16:14:52+00:00')
    const endTimestamp = new Date('2025-01-10T20:14:52+00:00')
    const nowTimestamp = endTimestamp

    // first chunk of time is 2 hours with 100 TVL, all inside the range so 100 * 2 = 200 TVL hours
    // second chunk of time is 1 hour with 50 TVL, all inside the range so 50 * 1 = 50 TVL hours
    // third chuck of time is 1 hour with 80 TVL, all inside the range so 80 * 1 = 80 TVL hours
    // TVL Hours = (200 + 50 + 80) = 330
    // Anualized TVL = 330 / 365 / 24 = 0.03767
    jest.mocked(getEvents).mockResolvedValueOnce([
      { amount: 50, timestamp: new Date('2025-01-10T18:14:52+00:00') }, // a 50 LP token deposit
      { amount: -30, timestamp: new Date('2025-01-10T17:14:52+00:00') }, // a 30 LP token withdrawal
    ])
    jest.mocked(calculateWeightedAveragePrice).mockReturnValue(1)
    const result = await getTvlProratedPerYear({
      vaultInfo,
      address,
      startTimestamp,
      endTimestamp,
      nowTimestamp,
    })
    expect(result).toBeCloseTo(0.03767)
  })
})
