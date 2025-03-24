import { Address } from 'viem'
import { getEvents } from '../calculateRevenue/protocols/somm/getEvents'
import { getVaults } from '../calculateRevenue/protocols/somm/getVaults'
import { NetworkId, ReferralEvent } from '../types'
import { filter } from './somm'

jest.mock('viem', () => ({
  ...jest.requireActual('viem'),
  getContract: jest.fn().mockReturnValue({
    read: {
      balanceOf: jest.fn().mockReturnValue(BigInt(100 * 1e18)),
      decimals: jest.fn().mockReturnValue(18),
    },
  }),
}))

jest.mock('../calculateRevenue/protocols/somm/getEvents')
jest.mock('../calculateRevenue/protocols/somm/getVaults')

const MOCK_VAULTS = [
  {
    networkId: NetworkId['arbitrum-one'],
    vaultAddress: '0x123' as Address,
  },
]

const MOCK_VAULTS_MULTIPLE = [
  {
    networkId: NetworkId['arbitrum-one'],
    vaultAddress: '0x123' as Address,
  },
  {
    networkId: NetworkId['arbitrum-one'],
    vaultAddress: '0x456' as Address,
  },
]

const address = '0x1234567890123456789012345678901234567890' as Address

describe('Somm filter function', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should return true if user TVL at time of referral is 0 and there is at least 1 TVL event after referral', async () => {
    jest.mocked(getVaults).mockResolvedValue(MOCK_VAULTS)
    jest
      .mocked(getEvents)
      .mockResolvedValueOnce([
        { amount: 100, timestamp: new Date('2023-10-25') },
      ])
    const event: ReferralEvent = {
      userAddress: address,
      timestamp: new Date('2023-09-30T00:00:00Z').getTime(),
      protocol: 'somm',
      referrerId: 'referrer1',
    }

    const result = await filter(event)
    expect(result).toEqual(true)
  })

  it('should return true if user TVL at time of referral is 0 and there is at least 1 TVL event after referral (multiple events)', async () => {
    jest.mocked(getVaults).mockResolvedValue(MOCK_VAULTS)
    jest.mocked(getEvents).mockResolvedValueOnce([
      { amount: 75, timestamp: new Date('2023-10-25') },
      { amount: -25, timestamp: new Date('2024-03-19') },
      { amount: 50, timestamp: new Date('2024-07-01') },
    ])
    const event: ReferralEvent = {
      userAddress: address,
      timestamp: new Date('2023-09-30T00:00:00Z').getTime(),
      protocol: 'somm',
      referrerId: 'referrer1',
    }

    const result = await filter(event)
    expect(result).toEqual(true)
  })

  it('should return true if user TVL at time of referral is 0 and there is at least 1 TVL event after referral (multiple vaults)', async () => {
    jest.mocked(getVaults).mockResolvedValue(MOCK_VAULTS_MULTIPLE)
    jest
      .mocked(getEvents)
      .mockResolvedValueOnce([
        { amount: 75, timestamp: new Date('2023-10-25') },
        { amount: 25, timestamp: new Date('2024-03-19') },
      ])
      .mockResolvedValueOnce([
        { amount: 100, timestamp: new Date('2023-10-25') },
      ])
    const event: ReferralEvent = {
      userAddress: address,
      timestamp: new Date('2023-09-30T00:00:00Z').getTime(),
      protocol: 'somm',
      referrerId: 'referrer1',
    }

    const result = await filter(event)
    expect(result).toEqual(true)
  })

  it('should return false if user has a TVL at time of referral', async () => {
    jest.mocked(getVaults).mockResolvedValue(MOCK_VAULTS)
    jest
      .mocked(getEvents)
      .mockResolvedValueOnce([
        { amount: 50, timestamp: new Date('2023-10-25') },
      ])
    const event: ReferralEvent = {
      userAddress: address,
      timestamp: new Date('2023-09-30T00:00:00Z').getTime(),
      protocol: 'somm',
      referrerId: 'referrer1',
    }

    const result = await filter(event)
    expect(result).toEqual(false)
  })

  it('should return false if user has a TVL at time of referral (multiple vaults', async () => {
    jest.mocked(getVaults).mockResolvedValue(MOCK_VAULTS_MULTIPLE)
    jest
      .mocked(getEvents)
      .mockResolvedValueOnce([
        { amount: 50, timestamp: new Date('2023-10-25') },
      ])
      .mockResolvedValueOnce([
        { amount: 100, timestamp: new Date('2023-10-25') },
      ])
    const event: ReferralEvent = {
      userAddress: address,
      timestamp: new Date('2023-09-30T00:00:00Z').getTime(),
      protocol: 'somm',
      referrerId: 'referrer1',
    }

    const result = await filter(event)
    expect(result).toEqual(false)
  })
})
