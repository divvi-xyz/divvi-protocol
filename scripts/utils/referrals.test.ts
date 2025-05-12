import { getHyperSyncClient } from './index'
import { fetchUniqueReferralEvents } from './referrals'
jest.mock('./index')

describe('fetchReferralEvents', () => {
  it('should fetch all referral events', async () => {
    const mockEventsResponse1 = {
      data: [
        {
          block: { number: 135226237, timestamp: 1746051251 },
          log: {
            transactionhash:
              '0x51725da9982f5bbec9e9eba728f6ad5d6d81ca302cb43a35d6998cd2e23f707c',
            blocknumber: 135226237,
            data: '0x0000000000000000000000000000000000000000000000000000000000000040a3ad4718b6448e2f491fb44d9c1872ab9b57b9ded869a18394bb30fb5821447500000000000000000000000000000000000000000000000000000000000000053432323230000000000000000000000000000000000000000000000000000000',
            topics: [
              '0xfddf272d6cdce612f7757626eff4fda5e235d0da62a22cc77ebe3e295b1479d0',
              '0x0000000000000000000000001234567890abcdef1234567890abcdef12345678',
              '0x0000000000000000000000005f0a55fad9424ac99429f635dfb9bf20c3360ab8',
              '0x0000000000000000000000007890abcdef1234567890abcdef1234567890abcd',
            ],
          },
        },
      ],
      nextBlock: 135226238,
    }
    const mockEventsResponse2 = {
      data: [
        {
          block: { number: 135226238, timestamp: 1746054321 },
          log: {
            transactionHash:
              '0x7890abcdef1234567890abcdef1234567890abcdef1234567890abcdef123456',
            blockNumber: 135226238,
            data: '0x0000000000000000000000000000000000000000000000000000000000000040a3ad4718b6448e2f491fb44d9c1872ab9b57b9ded869a18394bb30fb5821447500000000000000000000000000000000000000000000000000000000000000053432323230000000000000000000000000000000000000000000000000000000',
            topics: [
              '0xfddf272d6cdce612f7757626eff4fda5e235d0da62a22cc77ebe3e295b1479d0',
              '0x000000000000000000000000fedcba9876543210fedcba9876543210fedcba98',
              '0x0000000000000000000000005f0a55fad9424ac99429f635dfb9bf20c3360ab8',
              '0x000000000000000000000000abcdefabcdefabcdefabcdefabcdefabcdefabcd',
            ],
          },
        },
      ],
      nextBlock: 135226239,
    }
    const mockGetEvents = jest
      .fn()
      .mockImplementation(async ({ fromBlock }) => {
        if (fromBlock === 134945942) {
          return mockEventsResponse1
        }
        if (fromBlock === 135226238) {
          return mockEventsResponse2
        }
        return {
          data: [],
          nextBlock: 135226239,
        }
      })

    jest.mocked(getHyperSyncClient).mockReturnValue({
      getEvents: mockGetEvents,
    } as unknown as ReturnType<typeof getHyperSyncClient>)

    const events = await fetchUniqueReferralEvents('celo-transactions')
    expect(events).toEqual([
      {
        userAddress: '0x1234567890abcdef1234567890abcdef12345678',
        timestamp: 1746051251,
        referrerId: '0x7890abcdef1234567890abcdef1234567890abcd',
        protocol: 'celo-transactions',
      },
      {
        userAddress: '0xfedcba9876543210fedcba9876543210fedcba98',
        timestamp: 1746054321,
        referrerId: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        protocol: 'celo-transactions',
      },
    ])
  })

  it('should remove duplicate events', async () => {
    const mockEventsResponse1 = {
      data: [
        {
          block: { number: 135226237, timestamp: 1746051251 },
          log: {
            transactionhash:
              '0x51725da9982f5bbec9e9eba728f6ad5d6d81ca302cb43a35d6998cd2e23f707c',
            blocknumber: 135226237,
            data: '0x0000000000000000000000000000000000000000000000000000000000000040a3ad4718b6448e2f491fb44d9c1872ab9b57b9ded869a18394bb30fb5821447500000000000000000000000000000000000000000000000000000000000000053432323230000000000000000000000000000000000000000000000000000000',
            topics: [
              '0xfddf272d6cdce612f7757626eff4fda5e235d0da62a22cc77ebe3e295b1479d0',
              '0x0000000000000000000000001234567890abcdef1234567890abcdef12345678',
              '0x0000000000000000000000005f0a55fad9424ac99429f635dfb9bf20c3360ab8',
              '0x0000000000000000000000007890abcdef1234567890abcdef1234567890abcd',
            ],
          },
        },
      ],
      nextBlock: 135226238,
    }
    const mockEventsResponse2 = {
      data: [
        {
          block: { number: 135226238, timestamp: 1746054321 },
          log: {
            transactionHash:
              '0x7890abcdef1234567890abcdef1234567890abcdef1234567890abcdef123456',
            blockNumber: 135226238,
            data: '0x0000000000000000000000000000000000000000000000000000000000000040a3ad4718b6448e2f491fb44d9c1872ab9b57b9ded869a18394bb30fb5821447500000000000000000000000000000000000000000000000000000000000000053432323230000000000000000000000000000000000000000000000000000000',
            topics: [
              '0xfddf272d6cdce612f7757626eff4fda5e235d0da62a22cc77ebe3e295b1479d0',
              '0x0000000000000000000000001234567890abcdef1234567890abcdef12345678', // Same user address as in mockEventsResponse1
              '0x000000000000000000000000abcdefabcdefabcdefabcdefabcdefabcdefabcd',
              '0x000000000000000000000000fedcba9876543210fedcba9876543210fedcba98',
            ],
          },
        },
      ],
      nextBlock: 135226239,
    }
    const mockGetEvents = jest
      .fn()
      .mockImplementation(async ({ fromBlock }) => {
        if (fromBlock === 134945942) {
          return mockEventsResponse1
        }
        if (fromBlock === 135226238) {
          return mockEventsResponse2
        }
        return {
          data: [],
          nextBlock: 135226239,
        }
      })

    jest.mocked(getHyperSyncClient).mockReturnValue({
      getEvents: mockGetEvents,
    } as unknown as ReturnType<typeof getHyperSyncClient>)

    const events = await fetchUniqueReferralEvents('celo-transactions')
    expect(events).toEqual([
      {
        userAddress: '0x1234567890abcdef1234567890abcdef12345678',
        timestamp: 1746051251,
        referrerId: '0x7890abcdef1234567890abcdef1234567890abcd', // the referrer ID from the first event
        protocol: 'celo-transactions',
      },
    ])
  })
})
