import type { Hex } from 'viem'
import { DIVVI_MAGIC_PREFIX } from './parseReferral'

/**
 * Ensures proper byte alignment by:
 * 1. Aligning magic prefix to byte boundary if present
 * 2. Ensuring even hex length
 */
export function alignMagicPrefixAndPadHex(hexWithPrefix: Hex): Hex {
  let hex = hexWithPrefix.slice(2)

  // Align magic prefix if present and misaligned
  const prefixIndex = hex.indexOf(DIVVI_MAGIC_PREFIX)
  if (prefixIndex !== -1 && prefixIndex % 2 === 1) {
    hex = `0${hex}`
  }

  // Ensure even length
  if (hex.length % 2 === 1) {
    hex = `${hex}0`
  }

  return `0x${hex}`
}
