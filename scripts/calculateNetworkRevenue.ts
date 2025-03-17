import {
  HypersyncClient,
  QueryResponse,
  TransactionField,
} from '@envio-dev/hypersync-client'
import yargs from 'yargs'
import { NetworkId, Protocol, protocols } from './types'
import { NETWORK_ID_TO_HYPERSYNC_URL } from './utils/networks'
import { fetchReferralEvents, removeDuplicates } from './utils/referrals'

async function main(args: ReturnType<typeof parseArgs>) {
  const networkId = args.networkId as NetworkId
  const protocolId = args['protocol-id'] as string
  const startBlock = (args['start-block'] as number) ?? 0
  const endBlock = (args['end-block'] as number) ?? null

  if (!NETWORK_ID_TO_HYPERSYNC_URL[networkId]) {
    console.log(`Network ID ${networkId} is not supported by HyperSync`)
    return
  }

  const client = HypersyncClient.new({
    url: NETWORK_ID_TO_HYPERSYNC_URL[networkId],
    bearerToken: process.env.HYPERSYNC_API_KEY,
  })

  const users = await getUsers({ networkId, protocolId })
  if (users.length === 0) {
    console.log(`No users found for protocol ${protocolId} on ${networkId}`)
    return
  }

  const totalGasUsedWei = await fetchTotalGasUsed({
    client,
    users,
    startBlock,
    endBlock,
  })
  console.log(`Total gas used (Wei): ${totalGasUsedWei}`)
}

async function getUsers({
  networkId,
  protocolId,
}: {
  networkId: NetworkId
  protocolId: string
}): Promise<{ userAddress: string; timestamp: number }[]> {
  const referralEvents = await fetchReferralEvents(
    [networkId as NetworkId],
    protocolId as Protocol,
  )
  const uniqueEvents = removeDuplicates(referralEvents)

  const users: { userAddress: string; timestamp: number }[] = []
  for (const { userAddress, timestamp } of uniqueEvents) {
    users.push({
      userAddress,
      timestamp,
    })
  }

  return users
}

async function fetchTotalGasUsed({
  client,
  users,
  startBlock,
  endBlock,
}: {
  client: HypersyncClient
  users: { userAddress: string }[]
  startBlock: number
  endBlock: number | null
}): Promise<bigint> {
  const userAddresses = users.map((user) => user.userAddress)

  let fromBlock = startBlock
  let totalGasUsed = 0n
  let hasMoreBlocks = true

  const query = {
    transactions: [{ from: userAddresses }],
    fieldSelection: {
      transaction: [TransactionField.GasUsed, TransactionField.GasPrice],
    },
    fromBlock,
    ...(endBlock !== null && { toBlock: endBlock }),
  }

  try {
    do {
      const response: QueryResponse = await client.get(query)

      if (response.nextBlock <= fromBlock) {
        hasMoreBlocks = false
      }

      for (const tx of response.data.transactions) {
        totalGasUsed += BigInt(tx.gasUsed ?? 0) * BigInt(tx.gasPrice ?? 0)
      }

      fromBlock = response.nextBlock
      query.fromBlock = fromBlock

      if (endBlock !== null && fromBlock >= endBlock) {
        hasMoreBlocks = false
      }
    } while (hasMoreBlocks)

    return totalGasUsed
  } catch (error) {
    console.log('Error fetching transactions:', error)
    return 0n
  }
}

function parseArgs() {
  return yargs
    .option('networkId', {
      description: 'Network ID to of the chain to check',
      type: 'string',
      demandOption: true,
      choices: Object.values(NetworkId),
    })
    .option('protocol-id', {
      alias: 'p',
      description: 'ID of protocol to check against',
      choices: protocols,
      demandOption: true,
    })
    .option('start-block', {
      alias: 's',
      description:
        'timestamp at which to start checking for revenue (since epoch)',
      type: 'number',
    })
    .option('end-block', {
      alias: 'e',
      description:
        'timestamp at which to stop checking for revenue (since epoch)',
      type: 'number',
    })
    .strict()
    .parseSync()
}

if (require.main === module) {
  main(parseArgs())
    .then(() => {
      process.exit(0)
    })
    .catch((err) => {
      console.log(err)
      process.exit(1)
    })
}
