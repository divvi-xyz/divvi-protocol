import { writeFileSync } from 'fs'
import yargs from 'yargs'
import { ethers } from 'ethers'
import { supportedNetworkIds } from '../utils/networks'
import { NetworkId } from '../types'
import { getHyperSyncClient, getBlock } from '../utils'
import { LogField, QueryResponse } from '@envio-dev/hypersync-client'
import { paginateQuery } from '../utils/hypersyncPagination'
import { createWalletClient, http } from 'viem'
import { mnemonicToAccount } from 'viem/accounts'
import { getContract } from 'viem'
import { optimism } from 'viem/chains'
import DataAvailabilityAbi from '../../artifacts/contracts/DataAvailability.sol/DataAvailability.json'
import * as dotenv from 'dotenv'

// Load environment variables from .env file
dotenv.config()

interface TransferCount {
  [address: string]: number
}

async function getArgs() {
  const argv = await yargs
    .env('')
    .option('token-address', {
      description: 'address of the token to query',
      demandOption: true,
      type: 'string',
    })
    .option('network', {
      description: 'network to query',
      demandOption: true,
      choices: supportedNetworkIds,
    })
    .option('start-block', {
      description: 'start block number',
      demandOption: true,
      type: 'number',
    })
    .option('end-block', {
      description: 'end block number',
      demandOption: true,
      type: 'number',
    })
    .option('data-availability-address', {
      description: 'address of the DataAvailability contract on Optimism',
      demandOption: true,
      type: 'string',
    })
    .option('output-file', {
      alias: 'o',
      description: 'output file',
      type: 'string',
    })
    .option('upload', {
      description: 'whether to upload data to the contract',
      type: 'boolean',
      default: false,
    }).argv

  return {
    tokenAddress: argv['token-address'] as string,
    network: argv['network'] as NetworkId,
    startBlock: argv['start-block'] as number,
    endBlock: argv['end-block'] as number,
    dataAvailabilityAddress: argv['data-availability-address'] as string,
    output: argv['output-file'] ?? 'token-transfers.csv',
    upload: argv['upload'] as boolean,
  }
}

async function getTokenTransfers(
  tokenAddress: string,
  network: NetworkId,
  startBlock: number,
  endBlock: number,
): Promise<{ transferCounts: TransferCount; endBlockTimestamp: number }> {
  const client = getHyperSyncClient(network)

  // Query for ERC20 Transfer events
  const query = {
    fromBlock: startBlock,
    toBlock: endBlock,
    logs: [
      {
        address: [tokenAddress],
        topics: [
          // ERC20 Transfer event signature
          [
            '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
          ],
        ],
      },
    ],
    fieldSelection: {
      log: [LogField.Topic0, LogField.Topic1, LogField.Topic2, LogField.BlockNumber],
    },
  }

  const transferCounts: TransferCount = {}
  let count = 0
  let latestBlockNumber = 0

  // Use pagination to handle large result sets
  await paginateQuery(client, query, async (response: QueryResponse) => {
    for (const log of response.data.logs) {
      const topics = log.topics
      if (topics && topics.length >= 3 && topics[1] && topics[2]) {
        // The first topic is the event signature, second is from, third is to
        const from = ethers.getAddress('0x' + topics[1].slice(26))
        const to = ethers.getAddress('0x' + topics[2].slice(26))

        // Increment counts for both sender and receiver
        transferCounts[from] = (transferCounts[from] || 0) + 1
        transferCounts[to] = (transferCounts[to] || 0) + 1
        count++

        // Update latest block number if this log is more recent
        const blockNumber = Number(log.blockNumber)
        if (blockNumber > latestBlockNumber) {
          latestBlockNumber = blockNumber
        }
      }
    }
  })

  console.log(`Processed ${count} logs`)
  if (latestBlockNumber === 0) {
    throw new Error('No logs found in the specified block range')
  }

  // Get the timestamp for the latest block
  const latestBlock = await getBlock(network, BigInt(latestBlockNumber))
  const endBlockTimestamp = Number(latestBlock.timestamp)

  return { transferCounts, endBlockTimestamp }
}

function calculateHash(users: string[], values: number[]): string {
  const PRIME_MODULUS = 2n ** 256n - 189n
  let currentHash = 0n

  // Create array of user:value pairs
  const pairs = users.map((user, index) => ({
    user,
    value: values[index],
  }))

  // Sort pairs by user address (lowest to highest)
  pairs.sort((a, b) => {
    const addrA = BigInt(a.user)
    const addrB = BigInt(b.user)
    return addrA < addrB ? -1 : addrA > addrB ? 1 : 0
  })

  // Calculate hash for each sorted pair
  for (const { user, value } of pairs) {
    // Get packed bytes
    const packedBytes = ethers.solidityPacked(
      ['address', 'uint256'],
      [user, value],
    )

    // Calculate keccak256 hash of the user:value pair
    const pairHash = ethers.keccak256(packedBytes)

    // Convert to BigInt and add to current hash
    const pairHashBigInt = BigInt(pairHash)
    currentHash = (currentHash + pairHashBigInt) % PRIME_MODULUS
  }

  // Convert back to hex string with 0x prefix
  const finalHash = '0x' + currentHash.toString(16).padStart(64, '0')
  return finalHash
}

async function uploadDataToContract(
  dataAvailabilityAddress: string,
  timestamp: number,
  transferCounts: TransferCount,
) {
  // Create wallet client from mnemonic in .env file
  const mnemonic = process.env.MNEMONIC
  if (!mnemonic) {
    throw new Error('MNEMONIC must be set in .env file')
  }

  const account = mnemonicToAccount(mnemonic)
  const client = createWalletClient({
    account,
    chain: optimism,
    transport: http(),
  })

  // Get contract instance
  const contract = getContract({
    address: dataAvailabilityAddress as `0x${string}`,
    abi: DataAvailabilityAbi.abi,
    client,
  })

  // Prepare data for upload
  const users = Object.keys(transferCounts)
  const values = users.map((user) => transferCounts[user])

  // Upload data
  const hash = await contract.write.uploadData([timestamp, users, values])
  console.log(`Data uploaded with transaction hash: ${hash}`)
}

async function main() {
  const args = await getArgs()

  try {
    const { transferCounts, endBlockTimestamp } = await getTokenTransfers(
      args.tokenAddress,
      args.network,
      args.startBlock,
      args.endBlock,
    )

    // Format results as CSV
    const output = Object.entries(transferCounts)
      .map(([address, count]) => `${address},${count}`)
      .join('\n')

    // Write results to file
    writeFileSync(args.output, output)
    console.log(`Wrote results to ${args.output}`)

    // Calculate and log the hash
    const users = Object.keys(transferCounts)
    const values = users.map((user) => transferCounts[user])
    const calculatedHash = calculateHash(users, values)
    console.log(
      `Calculated hash for timestamp ${endBlockTimestamp}: ${calculatedHash}`,
    )

    if (args.upload) {
      await uploadDataToContract(
        args.dataAvailabilityAddress,
        endBlockTimestamp,
        transferCounts,
      )
    }
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}

main()
