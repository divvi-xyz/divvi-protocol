import { fetchReferralEvents, removeDuplicates } from './referrals'
import { NetworkId, ReferralEvent } from '../types'
import { getRegistryContract } from './index'
import { stringToHex } from 'viem'
jest.mock('./index')

const referrer1Hex = stringToHex('referrer1', { size: 32 })
const referrer2Hex = stringToHex('referrer2', { size: 32 })
const beefyHex = stringToHex('beefy', { size: 32 })

describe('fetchReferralEvents', () => {
  it('should fetch all referral events', async () => {
    const mockGetUsersCelo = jest
      .fn()
      .mockImplementation(([_, referrer]: [string, string]) => {
        if (referrer === referrer1Hex) {
          return [
            ['user1', 'user2'],
            [1, 2],
          ]
        }
        if (referrer === referrer2Hex) {
          return [
            ['user3', 'user4'],
            [3, 4],
          ]
        }
      })
    const mockGetReferrersCelo = jest
      .fn()
      .mockImplementation(([protocol]: [string]) => {
        if (protocol === beefyHex) {
          return [referrer1Hex, referrer2Hex]
        }
      })
    const mockGetUsersArbitrum = jest
      .fn()
      .mockImplementation(([_, referrer]: [string, string]) => {
        if (referrer === referrer1Hex) {
          return [
            ['user5', 'user6'],
            [5, 6],
          ]
        }
      })
    const mockGetReferrersArbitrum = jest
      .fn()
      .mockImplementation(([protocol]: [string]) => {
        if (protocol === beefyHex) {
          return [referrer1Hex]
        }
      })

    const mockGetRegistryContract = jest
      .fn()
      .mockImplementation(async (_, networkId: NetworkId) => {
        if (networkId === NetworkId['celo-mainnet']) {
          return {
            read: {
              getUsers: mockGetUsersCelo,
              getReferrers: mockGetReferrersCelo,
            },
          }
        } else {
          return {
            read: {
              getUsers: mockGetUsersArbitrum,
              getReferrers: mockGetReferrersArbitrum,
            },
          }
        }
      })
    jest.mocked(getRegistryContract).mockImplementation(mockGetRegistryContract)

    const events = await fetchReferralEvents(
      [NetworkId['celo-mainnet'], NetworkId['arbitrum-one']],
      'beefy',
    )
    expect(events).toEqual([
      {
        userAddress: 'user1',
        timestamp: 1,
        referrerId: 'referrer1',
        protocol: 'beefy',
      },
      {
        userAddress: 'user2',
        timestamp: 2,
        referrerId: 'referrer1',
        protocol: 'beefy',
      },
      {
        userAddress: 'user3',
        timestamp: 3,
        referrerId: 'referrer2',
        protocol: 'beefy',
      },
      {
        userAddress: 'user4',
        timestamp: 4,
        referrerId: 'referrer2',
        protocol: 'beefy',
      },
      {
        userAddress: 'user5',
        timestamp: 5,
        referrerId: 'referrer1',
        protocol: 'beefy',
      },
      {
        userAddress: 'user6',
        timestamp: 6,
        referrerId: 'referrer1',
        protocol: 'beefy',
      },
    ])
    expect(mockGetRegistryContract).toHaveBeenCalledTimes(2)
    expect(mockGetRegistryContract).toHaveBeenCalledWith(
      '0xBa9655677f4E42DD289F5b7888170bC0c7dA8Cdc',
      NetworkId['celo-mainnet'],
    )
    expect(mockGetRegistryContract).toHaveBeenCalledWith(
      '0xBa9655677f4E42DD289F5b7888170bC0c7dA8Cdc',
      NetworkId['arbitrum-one'],
    )

    expect(mockGetReferrersArbitrum).toHaveBeenCalledTimes(1)
    expect(mockGetReferrersArbitrum).toHaveBeenCalledWith([beefyHex])

    expect(mockGetReferrersCelo).toHaveBeenCalledTimes(1)
    expect(mockGetReferrersCelo).toHaveBeenCalledWith([beefyHex])

    expect(mockGetUsersArbitrum).toHaveBeenCalledTimes(1)
    expect(mockGetUsersArbitrum).toHaveBeenCalledWith([beefyHex, referrer1Hex])

    expect(mockGetUsersCelo).toHaveBeenCalledTimes(2)
    expect(mockGetUsersCelo).toHaveBeenCalledWith([beefyHex, referrer1Hex])
    expect(mockGetUsersCelo).toHaveBeenCalledWith([beefyHex, referrer1Hex])
  })
})

describe('removeDuplicates', () => {
  it('should remove duplicate events', () => {
    const events = [
      {
        userAddress: 'user1',
        timestamp: 1,
        referrerId: 'referrer1',
        protocol: 'beefy',
      },
      {
        userAddress: 'user2',
        timestamp: 2,
        referrerId: 'referrer1',
        protocol: 'beefy',
      },
      {
        userAddress: 'user1',
        timestamp: 3,
        referrerId: 'referrer2',
        protocol: 'beefy',
      },
    ] as ReferralEvent[]
    const uniqueEvents = removeDuplicates(events)
    expect(uniqueEvents).toEqual([
      {
        userAddress: 'user1',
        timestamp: 1,
        referrerId: 'referrer1',
        protocol: 'beefy',
      },
      {
        userAddress: 'user2',
        timestamp: 2,
        referrerId: 'referrer1',
        protocol: 'beefy',
      },
    ])
  })
})
