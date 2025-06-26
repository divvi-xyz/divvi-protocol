import { helloEndpoint } from './index'
import request from 'supertest'
import { getTestServer } from '../../../test/helpers'

describe(helloEndpoint.name, () => {
  it('tracks the event when the request is authorized', async () => {
    const server = getTestServer(helloEndpoint)
    await request(server)
      .get('/')
      .query({
        // TODO
      })
      .expect(200)
      .expect({
        message: 'OK',
        data: 'hello from celo-mobile-alfajores',
      })
  })
})
