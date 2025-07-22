import { Request, Response } from '@google-cloud/functions-framework'
import { getLoggingMiddleware, logger } from '../log'
import { asyncHandler } from '@valora/http-handler'
import { SharedConfig } from '../config/shared'
import { AnyZodObject, z } from 'zod'
import { parseRequest } from './parseRequest'

export function createEndpoint<
  Config extends SharedConfig,
  RequestSchema extends AnyZodObject,
>(
  name: string,
  {
    loadConfig,
    requestSchema,
    handler,
  }: {
    loadConfig: () => Config
    requestSchema: RequestSchema
    handler: ({
      req,
      res,
      config,
    }: {
      req: Request
      res: Response
      config: Config
      parsedRequest: z.infer<RequestSchema>
    }) => any
  },
) {
  let loadedConfig: Config
  // This way we only load the config once per function instance
  const wrappedLoadConfig = () => {
    if (!loadedConfig) {
      loadedConfig = loadConfig()
    }
    return loadedConfig
  }
  const asyncHttpFunction = asyncHandler(async (req, res) => {
    const parsedRequest = await parseRequest(req, requestSchema)
    return handler({
      req,
      res,
      config: wrappedLoadConfig(),
      parsedRequest,
    })
  }, logger)
  const wrappedHandler = (req: Request, res: Response) => {
    const loggingMiddleware = getLoggingMiddleware(
      wrappedLoadConfig().GCLOUD_PROJECT,
    )
    return loggingMiddleware(req, res, () => asyncHttpFunction(req, res))
  }

  return {
    name,
    handler: wrappedHandler,
  }
}
