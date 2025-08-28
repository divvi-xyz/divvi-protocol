import { rewardDivviEthCc2025IntegrationV1Endpoint } from './endpoints/rewardDivviEthCc2025IntegrationV1'
import { updateDivviEntities } from './endpoints/updateDivviEntities'

export = {
  [rewardDivviEthCc2025IntegrationV1Endpoint.name]:
    rewardDivviEthCc2025IntegrationV1Endpoint.handler,
  [updateDivviEntities.name]: updateDivviEntities.handler,
}
