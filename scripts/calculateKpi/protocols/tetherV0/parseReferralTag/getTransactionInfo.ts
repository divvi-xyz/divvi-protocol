import {
  Address,
  Hex,
  TransactionNotFoundError,
  TransactionReceiptNotFoundError,
  Hash,
} from 'viem'
import { getUserOperations, UserOperationWithHash } from './getUserOperations'
import { getViemPublicClient } from '../../../../utils'

// Discriminated union for transaction info
export type TransactionInfo = {
  type: 'transaction'
  hash: Hash
  from: Address
  to: Address | null
  calldata: Hex
} & (
  | {
      transactionType: 'regular'
    }
  | {
      transactionType: 'account-abstraction-bundle'
      userOperations: UserOperationWithHash[]
    }
)

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function getTransactionInfo({
  publicClient,
  txHash,
  delayFn = delay, // facilitates testing
  skipRetries = false,
}: {
  publicClient: ReturnType<typeof getViemPublicClient>
  txHash: Hex
  delayFn?: (ms: number) => Promise<void>
  skipRetries?: boolean
}): Promise<TransactionInfo> {
  const startTime = Date.now()
  const timeout = 30_000 // 30 seconds
  // In recent versions of viem, it's based on the chain block time
  // See https://github.com/wevm/viem/blob/a4159d7c9ebda462ee88ce9f0ca3a23c5c820057/src/clients/createClient.ts#L226-L231
  const retryDelay = publicClient.pollingInterval

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const [transaction, receipt] = await Promise.all([
        publicClient.getTransaction({ hash: txHash }),
        publicClient.getTransactionReceipt({ hash: txHash }),
      ])

      // Try to extract UserOperations to determine transaction type
      const userOperations = getUserOperations({
        to: transaction.to,
        calldata: transaction.input,
        logs: receipt.logs,
      })

      if (userOperations.length > 0) {
        // This is an Account Abstraction transaction
        return {
          hash: txHash,
          type: 'transaction',
          transactionType: 'account-abstraction-bundle',
          from: transaction.from,
          to: transaction.to,
          calldata: transaction.input,
          userOperations,
        }
      } else {
        // This is a regular transaction
        return {
          hash: txHash,
          type: 'transaction',
          transactionType: 'regular',
          from: transaction.from,
          to: transaction.to,
          calldata: transaction.input,
        }
      }
    } catch (error) {
      if (
        !(error instanceof TransactionNotFoundError) &&
        !(error instanceof TransactionReceiptNotFoundError)
      ) {
        throw error
      }

      // If skipRetries is true, throw immediately if transaction is not found
      if (skipRetries) {
        throw new Error(
          `Transaction ${txHash} was not found. Please ensure the transaction has been mined and the hash is correct.`,
        )
      }

      const elapsedTime = Date.now() - startTime
      if (elapsedTime >= timeout) {
        throw new Error(
          `Transaction ${txHash} was not found within allowed timeout`,
        )
      }

      await delayFn(retryDelay)
    }
  }
}
