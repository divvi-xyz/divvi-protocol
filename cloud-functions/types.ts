import { isHex } from 'viem'
import { z } from 'zod'

export { DivviGcloudProject } from './config/shared'

export const hexSchema = z.string().refine(
  (val) => isHex(val),
  (val) => ({
    message: `Invalid hex string ${val}`,
  }),
)
