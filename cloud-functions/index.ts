import { rewardDivviEthCc2025IntegrationV1Endpoint } from './endpoints/rewardDivviEthCc2025IntegrationV1'
import { redistributeValoraRewards } from './endpoints/redistributeValoraRewards'

export = {
  [rewardDivviEthCc2025IntegrationV1Endpoint.name]:
    rewardDivviEthCc2025IntegrationV1Endpoint.handler,
  [redistributeValoraRewards.name]: redistributeValoraRewards.handler,
}
