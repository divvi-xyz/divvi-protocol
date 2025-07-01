import { ZodRawShape } from 'zod'
import { sharedConfigSchema } from './shared'
import * as dotenv from 'dotenv'

export function loadSharedConfig<ConfigSchema extends ZodRawShape>(
  extendedSchema: ConfigSchema,
) {
  // To read env vars from .env locally
  if (process.env.NODE_ENV !== 'production') {
    dotenv.config()
  }

  const schema = sharedConfigSchema.extend(extendedSchema)

  return schema.parse(process.env)
}
