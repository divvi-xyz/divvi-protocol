import { http } from '@google-cloud/functions-framework'
// @ts-expect-error Cannot find module '@google-cloud/functions-framework/testing'
import { getTestServer as gcloudGetTestServer } from '@google-cloud/functions-framework/testing'
import { createEndpoint } from '../cloud-functions/services/createEndpoint'

export function getTestServer(endpoint: ReturnType<typeof createEndpoint>) {
  // Register the endpoint with the test server
  http(endpoint.name, endpoint.handler)
  return gcloudGetTestServer(endpoint.name)
}
