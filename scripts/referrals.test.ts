import { fetchReferralEvents, removeDuplicates } from './referrals'
import { NetworkId } from './types'
import { getRegistryContract } from './utils'
jest.mock('./utils')

describe('fetchReferralEvents', () => {
  it('should fetch all referral events', async () => {
    const mockGetUsersCelo = jest
      .fn()
      .mockImplementation(([_, referrer]: [string, string]) => {
        if (referrer === 'referrer1') {
          return [
            ['user1', 'user2'],
            [1, 2],
          ]
        }
        if (referrer === 'referrer2') {
          return [
            ['user3', 'user4'],
            [3, 4],
          ]
        }
      })
    const mockGetReferrersCelo = jest
      .fn()
      .mockImplementation(([protocol]: [string]) => {
        if (protocol === 'Beefy') {
          return ['referrer1', 'referrer2']
        }
      })
    const mockGetUsersArbitrum = jest
      .fn()
      .mockImplementation(([_, referrer]: [string, string]) => {
        if (referrer === 'referrer1') {
          return [
            ['user5', 'user6'],
            [5, 6],
          ]
        }
      })
    const mockGetReferrersArbitrum = jest
      .fn()
      .mockImplementation(([protocol]: [string]) => {
        if (protocol === 'Beefy') {
          return ['referrer1']
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
      'Beefy',
    )
    expect(events).toEqual([
      { userAddress: 'user1', timestamp: 1 },
      { userAddress: 'user2', timestamp: 2 },
      { userAddress: 'user3', timestamp: 3 },
      { userAddress: 'user4', timestamp: 4 },
      { userAddress: 'user5', timestamp: 5 },
      { userAddress: 'user6', timestamp: 6 },
    ])
    expect(mockGetRegistryContract).toHaveBeenCalledTimes(2)
    expect(mockGetRegistryContract).toHaveBeenCalledWith(
      '0x0',
      NetworkId['celo-mainnet'],
    )
    expect(mockGetRegistryContract).toHaveBeenCalledWith(
      '0x0',
      NetworkId['arbitrum-one'],
    )

    expect(mockGetReferrersArbitrum).toHaveBeenCalledTimes(1)
    expect(mockGetReferrersArbitrum).toHaveBeenCalledWith(['Beefy'])

    expect(mockGetReferrersCelo).toHaveBeenCalledTimes(1)
    expect(mockGetReferrersCelo).toHaveBeenCalledWith(['Beefy'])

    expect(mockGetUsersArbitrum).toHaveBeenCalledTimes(1)
    expect(mockGetUsersArbitrum).toHaveBeenCalledWith(['Beefy', 'referrer1'])

    expect(mockGetUsersCelo).toHaveBeenCalledTimes(2)
    expect(mockGetUsersCelo).toHaveBeenCalledWith(['Beefy', 'referrer1'])
    expect(mockGetUsersCelo).toHaveBeenCalledWith(['Beefy', 'referrer2'])
  })
})

describe('removeDuplicates', () => {
  it('should remove duplicate events', () => {
    const events = [
      { userAddress: 'user1', timestamp: 1 },
      { userAddress: 'user2', timestamp: 2 },
      { userAddress: 'user1', timestamp: 3 },
    ]
    const uniqueEvents = removeDuplicates(events)
    expect(uniqueEvents).toEqual([
      { userAddress: 'user1', timestamp: 1 },
      { userAddress: 'user2', timestamp: 2 },
    ])
  })
})
