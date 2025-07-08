import { logger } from '../log'
import { AnyZodObject, ZodError, z } from 'zod'
import { HttpError, Request } from '@valora/http-handler'

export async function parseRequest<T extends AnyZodObject>(
  req: Request,
  schema: T,
): Promise<z.infer<T>> {
  try {
    return await schema.parseAsync(req)
  } catch (err) {
    logger.warn({ err }, 'Failed to parse request')
    if (err instanceof ZodError) {
      throw new HttpError(400, 'Invalid request', err.format())
    }

    throw err
  }
}
