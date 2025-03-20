import { readFileSync, writeFileSync } from 'fs'
import { parse } from 'csv-parse/sync'
import { stringToHex, isAddress } from 'viem'
import yargs from 'yargs'

const refferStringColumn =
  "Enter the string you'll use as your referrer ID to register referrals onchain."
const protocolStringsColumn =
  'What protocol(s) will you be integrating into your product?'
const rewardAddressColumn = 'Enter a valid wallet address.'

const rewardRate = (1e18).toString()

const validProtocolStrings = new Set([
  'aerodrome',
  'allbridge',
  'beefy',
  'celo',
  'fonbnk',
  'mento',
  'somm',
  'vana',
  'velodrome',
])

function parseArgs() {
  return yargs
    .option('input-csv', {
      type: 'string',
      demandOption: true,
    })
    .option('output-json', {
      type: 'string',
      demandOption: true,
    })
    .option('contract-address', {
      type: 'string',
      demandOption: true,
    })
    .strict()
    .parseSync()
}

async function main(args: ReturnType<typeof parseArgs>) {
  const registrants: Record<string, string>[] = parse(
    readFileSync(args.inputCsv, 'utf-8').toString(),
    {
      columns: true,
    },
  )

  const transactions = registrants.map((registrant) => {
    let referrerId
    try {
      referrerId = stringToHex(registrant[refferStringColumn], { size: 32 })
    } catch (err) {
      console.error(
        `Error processing referrer: '${registrant[refferStringColumn]}'`,
      )
      throw err
    }

    const protocolNames = registrant[protocolStringsColumn]
      .split(',')
      .map((str) => str.trim())
    const protocolIds = []
    for (const protocolName of protocolNames) {
      try {
        if (!validProtocolStrings.has(protocolName)) {
          throw new Error(`Invalid protocol name: ${protocolName}`)
        }
        const protocolId = stringToHex(protocolName, { size: 32 })
        protocolIds.push(protocolId)
      } catch (err) {
        console.error(`Error processing protocol: '${protocolName}'`)
        throw err
      }
    }

    const rewardRates = new Array(protocolIds.length).fill(rewardRate)

    const rewardAddress = registrant[rewardAddressColumn]
    if (!isAddress(rewardAddress)) {
      throw new Error(`Invalid address: ${rewardAddress}`)
    }

    return {
      to: args.contractAddress,
      value: '0',
      data: null,
      contractMethod: {
        inputs: [
          {
            internalType: 'bytes32',
            name: 'referrerId',
            type: 'bytes32',
          },
          {
            internalType: 'bytes32[]',
            name: 'protocolIds',
            type: 'bytes32[]',
          },
          {
            internalType: 'uint256[]',
            name: 'rewardRates',
            type: 'uint256[]',
          },
          {
            internalType: 'address',
            name: 'rewardAddress',
            type: 'address',
          },
        ],
        name: 'registerReferrer',
        payable: false,
      },
      contractInputsValues: {
        referrerId,
        protocolIds: `[${protocolIds.join(', ')}]`,
        rewardRates: `[${rewardRates.join(', ')}]`,
        rewardAddress,
      },
    }
  })

  const transactionsBatch = {
    // The Safe UI will throw a warning about some missing properties, but will
    // fill in the correct values...

    // ..but the meta property required by the Safe UI, even if the value is an
    // empty object.
    meta: {},
    transactions,
  }

  writeFileSync(args.outputJson, JSON.stringify(transactionsBatch, null, 2), {
    encoding: 'utf-8',
  })
}

main(parseArgs())
  .then(() => {
    process.exit(0)
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
