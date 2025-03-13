import { Address, stringToHex } from 'viem'
import yargs from 'yargs'
import { NetworkId, protocols } from './types'
import { getRegistryContract } from './utils'
import {
  NETWORK_ID_TO_HYPERSYNC_URL,
  NETWORK_ID_TO_REGISTRY_ADDRESS,
} from './utils/networks'
import {
  HypersyncClient,
  QueryResponse,
  TransactionField,
} from '@envio-dev/hypersync-client'

async function main(args: ReturnType<typeof parseArgs>) {
  const networkId = args.networkId as keyof typeof NETWORK_ID_TO_HYPERSYNC_URL
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

  const users = await getUsersForProtocol({ networkId, protocolId })
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

  const query = {
    transactions: [{ from: userAddresses }],
    fieldSelection: { transaction: [TransactionField.GasUsed] },
    fromBlock: startBlock,
    ...(endBlock !== null && { toBlock: endBlock }),
  }

  try {
    const response: QueryResponse = await client.get(query)
    return response.data.transactions.reduce(
      (sum: bigint, tx) => sum + BigInt(tx.gasUsed ?? 0),
      0n,
    )
  } catch (error) {
    console.log('Error fetching gas usage: ', error)
    return 0n
  }
}

async function getUsersForProtocol({
  networkId,
  protocolId,
}: {
  networkId: NetworkId
  protocolId: string
}): Promise<{ userAddress: string; timestamp: number }[]> {
  const hexProtocolId = stringToHex(protocolId, { size: 32 })

  if (!NETWORK_ID_TO_REGISTRY_ADDRESS[networkId]) {
    return []
  }

  const registryContract = await getRegistryContract(
    NETWORK_ID_TO_REGISTRY_ADDRESS[networkId] as Address,
    networkId,
  )

  const protocolResponse = (await registryContract.read.getProtocols([
    hexProtocolId,
  ])) as Address[]

  if (!protocolResponse || protocolResponse.length === 0) {
    throw new Error(`Protocol ${protocolId} not found on ${networkId}`)
  }

  const protocol = protocolResponse[0]
  const referrers = (await registryContract.read.getReferrers([
    protocol,
  ])) as Address[]

  const users: { userAddress: string; timestamp: number }[] = []
  for (const referrer of referrers) {
    const [userAddresses, timestamps] = (await registryContract.read.getUsers([
      protocol,
      referrer,
    ])) as [string[], number[]]

    userAddresses.forEach((userAddress, index) => {
      users.push({
        userAddress,
        timestamp: timestamps[index],
      })
    })
  }

  return users
}

function parseArgs() {
  return yargs
    .option('networkId', {
      description: 'Network ID to of the chain to check',
      type: 'string',
      demandOption: true,
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
