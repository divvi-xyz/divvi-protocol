import { fetchEvents } from '../utils/events'
import { getEvents } from './getEvents'
import { getBlock } from '../../../utils'
import { NetworkId } from '../../../types'

jest.mock('../utils/events')
jest.mock('../../../utils')
jest.mock('viem', () => ({
  ...jest.requireActual('viem'),
  getContract: jest.fn().mockReturnValue({
    read: {
      decimals: jest.fn().mockReturnValue(1),
    },
  }),
}))

const mockAddress1 = '0x1234567890123456789012345678901234567890'
const mockAddress2 = '0x4567890123456789012345678901234567890123'

describe('getEvents', () => {
  it('should return the correct deposit and withdraw events', async () => {
    jest.mocked(getBlock).mockImplementation(
      (_networkId: NetworkId, blockNumber: bigint) =>
        Promise.resolve({
          timestamp: blockNumber * 100n,
        }) as unknown as ReturnType<typeof getBlock>,
    )

    jest.mocked(fetchEvents).mockResolvedValueOnce([
      {
        args: { shares: 100n, sender: mockAddress1 },
        blockNumber: BigInt(1),
      },
      {
        args: { shares: 200n, sender: mockAddress2 },
        blockNumber: BigInt(2),
      },
    ] as unknown as ReturnType<typeof fetchEvents>)
    jest.mocked(fetchEvents).mockResolvedValueOnce([
      {
        args: { shares: 50n, sender: mockAddress1 },
        blockNumber: BigInt(3),
      },
      {
        args: { shares: 30n, sender: mockAddress2 },
        blockNumber: BigInt(4),
      },
    ] as unknown as ReturnType<typeof fetchEvents>)
    const result = await getEvents({
      address: mockAddress1,
      vaultInfo: {
        networkId: NetworkId['arbitrum-one'],
        vaultAddress: '0x1234567890123456789012345678901234567890',
      },
      startTimestamp: new Date('2021-01-01'),
      endTimestamp: new Date('2021-01-10'),
    })
    expect(result).toEqual([
      { amount: -5, timestamp: new Date(3 * 100 * 1000) },
      { amount: 10, timestamp: new Date(1 * 100 * 1000) },
    ])
    expect(fetchEvents).toHaveBeenCalledTimes(2)
    expect(fetchEvents).toHaveBeenNthCalledWith(1, {
      contract: expect.any(Object),
      networkId: NetworkId['arbitrum-one'],
      eventName: 'Deposit',
      startTimestamp: new Date('2021-01-01'),
      endTimestamp: new Date('2021-01-10'),
    })
    expect(fetchEvents).toHaveBeenNthCalledWith(2, {
      contract: expect.any(Object),
      networkId: NetworkId['arbitrum-one'],
      eventName: 'Withdraw',
      startTimestamp: new Date('2021-01-01'),
      endTimestamp: new Date('2021-01-10'),
    })
    expect(getBlock).toHaveBeenCalledTimes(2)
  })
})
