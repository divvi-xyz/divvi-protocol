import { Query, QueryResponse } from '@envio-dev/hypersync-client'

export async function paginateQuery(
  client: { get: (query: Query) => Promise<QueryResponse> },
  query: Query,
  onPage: (response: QueryResponse) => Promise<boolean | void>,
): Promise<void> {
  let hasMoreBlocks = true

  while (hasMoreBlocks) {
    const response = await client.get(query)

    const shouldStop = await onPage(response)
    if (shouldStop === true) {
      break
    }

    if (response.nextBlock === query.fromBlock) {
      hasMoreBlocks = false
    } else {
      query.fromBlock = response.nextBlock
    }

    if (query.toBlock && query.fromBlock >= query.toBlock) {
      hasMoreBlocks = false
    }
  }
}
