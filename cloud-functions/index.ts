import { rewardDivviEthCc2025IntegrationV1Endpoint } from './endpoints/rewardDivviEthCc2025IntegrationV1'
import { redistributeValoraRewards } from './endpoints/redistributeValoraRewards'
import { updateDivviEntities } from './endpoints/updateDivviEntities'

export = {
  [rewardDivviEthCc2025IntegrationV1Endpoint.name]:
    rewardDivviEthCc2025IntegrationV1Endpoint.handler,
  [redistributeValoraRewards.name]: redistributeValoraRewards.handler,
  [updateDivviEntities.name]: updateDivviEntities.handler,
}
