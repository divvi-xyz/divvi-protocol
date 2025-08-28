import { NetworkId } from '../types'
import { NETWORK_ID_TO_SAFE_CONFIG } from './constants'

async function checkSafeTxExecuted(safeTxHash: string, networkId: NetworkId) {
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

  const data = (await response.json()) as { isExecuted: boolean }

  return data.isExecuted
}

export async function waitForSafeTxExecuted(
  safeTxHash: string,
  networkId: NetworkId,
  maxRetries: number = 10,
  initialDelay: number = 2000,
): Promise<void> {
  let delay = initialDelay
  let retries = 0

  while (retries < maxRetries) {
    try {
      const isExecuted = await checkSafeTxExecuted(safeTxHash, networkId)

      if (isExecuted) {
        console.log(`✅ Safe transaction ${safeTxHash} has been executed`)
        return
      }

      console.log(
        `⏳ Waiting for Safe transaction ${safeTxHash} to be executed... (attempt ${retries + 1}/${maxRetries})`,
      )

      // Wait with exponential backoff
      await new Promise((resolve) => setTimeout(resolve, delay))

      // Exponential backoff: double the delay for next iteration
      delay *= 2
      retries++
    } catch (error) {
      console.warn(
        `⚠️ Error checking Safe transaction status (attempt ${retries + 1}/${maxRetries}):`,
        error,
      )

      if (retries >= maxRetries - 1) {
        throw new Error(
          `Failed to confirm Safe transaction execution after ${maxRetries} attempts: ${error}`,
        )
      }

      // Wait with exponential backoff even on error
      await new Promise((resolve) => setTimeout(resolve, delay))
      delay *= 2
      retries++
    }
  }

  throw new Error(
    `Safe transaction ${safeTxHash} was not executed within the maximum retry limit`,
  )
}
