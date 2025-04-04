import { Address } from "viem"
import { FonbnkNetwork } from "./constants"

export interface FonbnkAsset {
    network: FonbnkNetwork
    asset: string
  }
  
export interface FonbnkTransaction {
    amount: bigint
    tokenAddress: Address
    timestamp: Date
  }