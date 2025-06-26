import { createLogger, createLoggingMiddleware } from '@valora/logging'
import { DivviGcloudProject } from './types'

export const logger = createLogger({
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie'],
    censor: '***REDACTED***',
  },
})

let loggingMiddleware: ReturnType<typeof createLoggingMiddleware>

export const getLoggingMiddleware = (gcloudProject: DivviGcloudProject) => {
  if (!loggingMiddleware) {
    loggingMiddleware = createLoggingMiddleware({
      logger,
      projectId: gcloudProject,
    })
  }
  return loggingMiddleware
}
