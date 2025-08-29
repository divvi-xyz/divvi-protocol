import { NetworkId } from '../types'
import { NETWORK_ID_TO_SAFE_CONFIG } from './constants'
import readline from 'readline'

async function checkSafeTxExecutedAndSuccessful(
  safeTxHash: string,
  networkId: NetworkId,
) {
  const safeConfig = NETWORK_ID_TO_SAFE_CONFIG[networkId]

  if (!safeConfig) {
    throw new Error(`No Safe config found for networkId: ${networkId}`)
  }

  const response = await fetch(
    `${safeConfig.apiUrl}/v2/multisig-transactions/${safeTxHash}/`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    },
  )

  if (!response.ok) {
    throw new Error(`Failed to fetch transaction: ${response.statusText}`)
  }

  const data = (await response.json()) as {
    isExecuted: boolean
    isSuccessful: boolean
  }

  return data.isExecuted && data.isSuccessful
}

export async function waitForSafeTxExecuted(
  safeTxHash: string,
  networkId: NetworkId,
): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  await new Promise((resolve) =>
    rl.question(
      'Press enter key when the Safe transaction has been signed and executed...',
      resolve,
    ),
  )
  rl.close()
  console.log('Waiting for Safe transaction to appear on chain...')
  while (true) {
    const isExecutedAndSuccessful = await checkSafeTxExecutedAndSuccessful(
      safeTxHash,
      networkId,
    )
    if (isExecutedAndSuccessful) {
      break
    }
    await new Promise((resolve) => setTimeout(resolve, 60 * 1000))
  }
  console.log('Safe transaction executed on chain and successful')
}
