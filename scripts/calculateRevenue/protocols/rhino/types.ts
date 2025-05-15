import { Address } from "viem"

export interface BridgeTransaction {
  amount: bigint
  tokenAddress: Address
  timestamp: Date
}