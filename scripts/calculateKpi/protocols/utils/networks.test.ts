import { fetchNetworkMetrics } from './networks'
import { getHyperSyncClient } from '../../../utils'
import { QueryResponse } from '@envio-dev/hypersync-client'
import { NetworkId } from '../../../types'

jest.mock('../../../utils')

const mockResponse: QueryResponse = {
  data: {
    blocks: [],
    transactions: [],
    logs: [],
    traces: [],
  },
  nextBlock: 100,
  totalExecutionTime: 50,
}

function calculateExpected(transactions: { gasUsed: bigint }[]) {
  return transactions.reduce((acc, tx) => acc + Number(tx.gasUsed), 0)
}

describe('fetchNetworkMetrics', () => {
  const networkId: NetworkId = NetworkId['celo-mainnet']
  const users = ['0xUser1']
  let mockClient: { get: jest.Mock }

  beforeEach(() => {
    jest.clearAllMocks()
    mockClient = { get: jest.fn() }
    jest
      .mocked(getHyperSyncClient)
      .mockReturnValue(
        mockClient as unknown as ReturnType<typeof getHyperSyncClient>,
      )
  })

  it('should return correct sum', async () => {
    mockClient.get.mockReturnValueOnce({
      ...mockResponse,
      data: {
        ...mockResponse.data,
        transactions: [{ gasUsed: 64678n }, { gasUsed: 211128n }],
      },
    } as QueryResponse)

    const result = await fetchNetworkMetrics({
      networkId,
      users,
      startBlock: 0,
      endBlockExclusive: 100,
    })

    expect(result.totalGasUsed).toBe(
      calculateExpected([{ gasUsed: 64678n }, { gasUsed: 211128n }]),
    )
    expect(mockClient.get).toHaveBeenCalledTimes(1)
  })

  it('should return correct sum if no endblock is passed', async () => {
    mockClient.get
      .mockReturnValueOnce({
        ...mockResponse,
        data: {
          ...mockResponse.data,
          transactions: [{ gasUsed: 64678n }, { gasUsed: 211128n }],
        },
      } as QueryResponse)
      .mockReturnValueOnce(mockResponse as QueryResponse)

    const result = await fetchNetworkMetrics({
      networkId,
      users,
      startBlock: 0,
    })

    expect(result.totalGasUsed).toBe(
      calculateExpected([{ gasUsed: 64678n }, { gasUsed: 211128n }]),
    )
    expect(mockClient.get).toHaveBeenCalledTimes(2)
  })

  it('should throw an error when API fails', async () => {
    mockClient.get.mockRejectedValue(new Error('API failure'))

    await expect(
      fetchNetworkMetrics({ networkId, users, startBlock: 0 }),
    ).rejects.toThrow('API failure')
    expect(mockClient.get).toHaveBeenCalledTimes(1)
  })

  it('should handle pagination and multiple API calls', async () => {
    mockClient.get
      .mockResolvedValueOnce({
        data: {
          transactions: [{ gasUsed: 30000n }],
        },
        nextBlock: 50,
      } as QueryResponse)
      .mockResolvedValueOnce({
        data: {
          transactions: [{ gasUsed: 60000n }],
        },
        nextBlock: 100,
      } as QueryResponse)
      .mockResolvedValueOnce(mockResponse as QueryResponse)

    const result = await fetchNetworkMetrics({
      networkId,
      users,
      startBlock: 0,
    })

    expect(result.totalGasUsed).toBe(
      calculateExpected([{ gasUsed: 30000n }, { gasUsed: 60000n }]),
    )
    expect(mockClient.get).toHaveBeenCalledTimes(3)
  })
})
