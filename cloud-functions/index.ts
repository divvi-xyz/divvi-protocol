import { helloEndpoint } from './endpoints/rewardEthCc2025IntegrationV1'

export = {
  [helloEndpoint.name]: helloEndpoint.handler,
}
