import {
  Log,
  parseEventLogs,
  decodeFunctionData,
  Address,
  Hex,
  getAddress,
  isAddressEqual,
  Hash,
} from 'viem'
import {
  entryPoint06Address,
  entryPoint07Address,
  entryPoint08Address,
  entryPoint06Abi,
  entryPoint07Abi,
  entryPoint08Abi,
} from 'viem/account-abstraction'

// We should keep this list up to date as new entry point versions are released
const entryPointConfigByAddress = {
  [entryPoint06Address]: { version: '0.6', abi: entryPoint06Abi },
  [entryPoint07Address]: { version: '0.7', abi: entryPoint07Abi },
  [entryPoint08Address]: { version: '0.8', abi: entryPoint08Abi },
} as const

export type UserOperationWithHash = {
  userOpHash: Hash
  sender: Address
  calldata: Hex
}

export function isEntryPointAddress(address: Address): boolean {
  return Object.keys(entryPointConfigByAddress).includes(getAddress(address))
}

/**
 * Extracts and validates UserOperations from a transaction that called an EntryPoint contract.
 *
 * In ERC-4337 (Account Abstraction), UserOperations are batched and executed through trusted
 * EntryPoint contracts. These EntryPoints are singleton contracts deployed at known addresses
 * across all networks, making them safe to trust without additional verification.
 *
 * This function:
 * 1. Validates that the transaction was sent to a known, trusted EntryPoint address
 * 2. Parses UserOperationEvent logs to find successfully executed operations
 * 3. Decodes the handleOps calldata to extract the original UserOperation structs
 * 4. Matches events to operations using sender+nonce to get the corresponding calldata
 *
 * We can trust these UserOperations because:
 * - They come from official EntryPoint contracts (deployed by the ERC-4337 team)
 * - They have corresponding successful execution events
 *
 * @param to - The address the transaction was sent to (should be an EntryPoint)
 * @param calldata - The transaction's calldata (should be a handleOps call)
 * @param logs - Event logs from the transaction
 * @param eip155ChainId - The chain ID for userOpHash calculation
 * @returns Array of UserOperationWithHash that were successfully executed
 */
export function getUserOperations({
  to,
  calldata,
  logs,
}: {
  to: Address | null
  calldata: Hex
  logs: Log[]
}): UserOperationWithHash[] {
  if (!to) {
    return []
  }

  const normalizedAddress = getAddress(to)

  const validatedEntryPointAddress =
    normalizedAddress in entryPointConfigByAddress
      ? (normalizedAddress as keyof typeof entryPointConfigByAddress)
      : undefined
  if (!validatedEntryPointAddress) {
    return []
  }

  const entryPointConfig = entryPointConfigByAddress[validatedEntryPointAddress]

  const parsedEvents = parseEventLogs({
    abi: entryPointConfig.abi,
    logs,
    eventName: 'UserOperationEvent',
  })

  const successfulUserOpEvents = parsedEvents.filter(
    (event) => isAddressEqual(event.address, to) && event.args.success === true,
  )

  if (successfulUserOpEvents.length === 0) {
    return []
  }

  const { functionName, args } = decodeFunctionData({
    abi: entryPointConfig.abi,
    data: calldata,
  })

  if (functionName !== 'handleOps') {
    return []
  }

  // The first argument to handleOps is the array of UserOperations
  const userOps = args?.[0]

  if (!userOps || userOps.length === 0) {
    // This case should ideally not happen if there are successful events,
    // but it's good for robustness.
    throw new Error(
      'No UserOperations found in calldata despite successful events',
    )
  }

  const userOpNonceCalldataMap = new Map<string, { calldata: Hex }>()
  for (const userOp of userOps) {
    const key = `${userOp.sender.toLowerCase()}-${userOp.nonce}`
    userOpNonceCalldataMap.set(key, { calldata: userOp.callData })
  }

  const matchedUserOps: UserOperationWithHash[] = []
  for (const event of successfulUserOpEvents) {
    const key = `${event.args.sender.toLowerCase()}-${event.args.nonce}`
    const matched = userOpNonceCalldataMap.get(key)
    if (!matched) {
      // This should not happen
      throw new Error(
        `No matching UserOperation found for successful event: sender=${event.args.sender}, nonce=${event.args.nonce}, userOpHash=${event.args.userOpHash}`,
      )
    }
    matchedUserOps.push({
      userOpHash: event.args.userOpHash,
      sender: event.args.sender,
      calldata: matched.calldata,
    })
  }

  // Note: we don't need to check the signature because we're only looking at successful events
  // that were emitted by trusted EntryPoint contracts.
  return matchedUserOps
}
