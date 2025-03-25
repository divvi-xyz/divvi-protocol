import { Query, QueryResponse } from '@envio-dev/hypersync-client'

export async function paginateQuery(
  client: { get: (query: Query) => Promise<QueryResponse> },
  query: Query,
  onPage: (response: QueryResponse) => Promise<boolean | void>,
): Promise<void> {
  let hasMoreBlocks = true
  let fromBlock = query.fromBlock

  while (hasMoreBlocks) {
    const response = await client.get({ ...query, fromBlock })

    const shouldStop = await onPage(response)
    if (shouldStop === true) {
      break
    }

    if (response.nextBlock === fromBlock) {
      hasMoreBlocks = false
    } else {
      fromBlock = response.nextBlock
    }

    if (query.toBlock && fromBlock >= query.toBlock) {
      hasMoreBlocks = false
    }
  }
}
