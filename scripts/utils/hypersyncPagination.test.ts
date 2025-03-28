import { paginateQuery } from './hypersyncPagination'
import {
  Query,
  QueryResponse,
  QueryResponseData,
  BlockField,
} from '@envio-dev/hypersync-client'

describe('paginateQuery', () => {
  const mockClient = { get: jest.fn<Promise<QueryResponse>, [Query]>() }

  const createQueryResponse = (
    nextBlock: number,
    dataOverrides: Partial<QueryResponseData> = {},
  ): QueryResponse => ({
    nextBlock,
    totalExecutionTime: 1,
    data: {
      blocks: [],
      transactions: [],
      logs: [],
      traces: [],
      ...dataOverrides,
    },
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  const defaultFieldSelection = { block: [BlockField.Number] }

  it('paginates until hasMoreBlocks is false', async () => {
    mockClient.get
      .mockResolvedValueOnce(createQueryResponse(10))
      .mockResolvedValueOnce(createQueryResponse(20))
      .mockResolvedValueOnce(createQueryResponse(20)) // triggers hasMoreBlocks = false

    const query: Query = { fromBlock: 0, fieldSelection: defaultFieldSelection }
    const onPage = jest.fn()

    await paginateQuery(mockClient, query, onPage)

    expect(mockClient.get).toHaveBeenCalledTimes(3)
    expect(onPage).toHaveBeenCalledTimes(3)
  })

  it('stops pagination if onPage returns true', async () => {
    mockClient.get
      .mockResolvedValueOnce(createQueryResponse(10))
      .mockResolvedValueOnce(createQueryResponse(20))

    const query: Query = { fromBlock: 0, fieldSelection: defaultFieldSelection }
    const onPage = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(true) // stops pagination here

    await paginateQuery(mockClient, query, onPage)

    expect(mockClient.get).toHaveBeenCalledTimes(2)
    expect(onPage).toHaveBeenCalledTimes(2)
  })

  it('stops pagination when query reaches toBlock limit', async () => {
    mockClient.get
      .mockResolvedValueOnce(createQueryResponse(50))
      .mockResolvedValueOnce(createQueryResponse(100))

    const query: Query = {
      fromBlock: 0,
      toBlock: 75,
      fieldSelection: defaultFieldSelection,
    }
    const onPage = jest.fn()

    await paginateQuery(mockClient, query, onPage)

    expect(mockClient.get).toHaveBeenCalledTimes(2)
    expect(onPage).toHaveBeenCalledTimes(2)
  })

  it('handles single page response correctly', async () => {
    mockClient.get.mockResolvedValueOnce(createQueryResponse(0))

    const query: Query = { fromBlock: 0, fieldSelection: defaultFieldSelection }
    const onPage = jest.fn()

    await paginateQuery(mockClient, query, onPage)

    expect(mockClient.get).toHaveBeenCalledTimes(1)
    expect(onPage).toHaveBeenCalledTimes(1)
  })

  it('passes correct query parameters to client.get across multiple paginated requests', async () => {
    mockClient.get
      .mockResolvedValueOnce(createQueryResponse(10))
      .mockResolvedValueOnce(createQueryResponse(15))

    const query: Query = {
      fromBlock: 5,
      toBlock: 15,
      fieldSelection: defaultFieldSelection,
    }
    const onPage = jest.fn()

    await paginateQuery(mockClient, query, onPage)

    expect(mockClient.get).toHaveBeenNthCalledWith(1, {
      fromBlock: 5,
      toBlock: 15,
      fieldSelection: defaultFieldSelection,
    })

    expect(mockClient.get).toHaveBeenNthCalledWith(2, {
      fromBlock: 10, // matches the first mocked response's nextBlock
      toBlock: 15,
      fieldSelection: defaultFieldSelection,
    })

    expect(onPage).toHaveBeenCalledTimes(2)
  })
})
