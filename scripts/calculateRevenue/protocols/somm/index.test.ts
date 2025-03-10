import { Address } from 'viem'
import { NetworkId } from '../../../types'
import { getDailyMeanTvl } from './index'
import { getEvents } from './getEvents'

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

const vaultInfo = {
  networkId: NetworkId['arbitrum-one'],
  vaultAddress: '0x1234567890123456789012345678901234567890' as Address,
}
const address = '0x1234567890123456789012345678901234567890'

describe('getDailyMeanTvl', () => {
  it('should throw an error if endTimestamp is in the future', async () => {
    const startTimestamp = new Date('2021-01-0')
    const endTimestamp = new Date('2022-01-01')
    const nowTimestamp = new Date('2021-01-01')
    await expect(
      getDailyMeanTvl({
        vaultInfo,
        address,
        startTimestamp,
        endTimestamp,
        nowTimestamp,
      }),
    ).rejects.toThrow('Cannot have an endTimestamp in the future')
  })
  it('should return the correct daily mean TVL', async () => {
    const startTimestamp = new Date('2021-01-05')
    const endTimestamp = new Date('2021-01-20')
    const nowTimestamp = new Date('2021-01-30')
    jest.mocked(getEvents).mockResolvedValueOnce([
      { amount: 50, timestamp: new Date('2021-01-25') }, // a 50 LP token deposit
      { amount: -30, timestamp: new Date('2021-01-15') }, // a 30 LP token withdrawal
      { amount: 20, timestamp: new Date('2021-01-10') }, // a 20 LP token deposit
    ])
    const result = await getDailyMeanTvl({
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
    // mean TVL = (250 + 400 + 300) / 15 = 63.33333333333333
    expect(result).toBeCloseTo(63.33333333333333)
  })
})
