import { findQualifyingNetworkReferral } from './qualifyingNetworkReferral'
//import * as utils from '../utils'
//import * as hypersyncPagination from '../utils/hypersyncPagination'
//import * as getReferrerIdModule from '../calculateKpi/protocols/tetherV0/parseReferralTag/getReferrerIdFromTx'
import { NetworkId } from '../types'

// Mocked data
const mockUsers = new Set(['0xUser1', '0xUser2'])
const mockNetworkId = NetworkId['celo-mainnet']
const mockStartTimestamp = new Date('2024-01-01T00:00:00Z')
const mockEndTimestamp = new Date('2024-01-02T00:00:00Z')

jest.mock('../utils', () => ({
  getHyperSyncClient: jest.fn(() => ({})),
}))

jest.mock('../utils/hypersyncPagination', () => ({
  paginateEventsQuery: jest.fn(async (_client, _query, cb) => {
    const user = _query.transactions[0].from[0] as string
    const data = {
      '0xUser1': [
        {
          transaction: { hash: '0xTxHash', input: '0xTxInput' },
          block: { timestamp: 1234567890 },
        },
      ],
      '0xUser2': [],
    }[user]
    await cb({ data })
  }),
}))

jest.mock(
  '../calculateKpi/protocols/tetherV0/parseReferralTag/getReferrerIdFromTx',
  () => ({
    getReferrerIdFromTx: jest.fn(async () => '0xReferrer'),
  }),
)

// Mock getBlockRange to return fixed blocks
jest.mock('../calculateKpi/protocols/utils/events', () => ({
  getBlockRange: jest.fn(async () => ({
    startBlock: 1,
    endBlockExclusive: 100,
  })),
}))

describe('findQualifyingNetworkReferral', () => {
  it('returns qualifying referrals for users', async () => {
    const result = await findQualifyingNetworkReferral({
      users: mockUsers,
      startTimestamp: mockStartTimestamp,
      endTimestampExclusive: mockEndTimestamp,
      networkId: mockNetworkId,
    })
    expect(result).toHaveLength(1)
    expect(result[0]).toHaveProperty('userAddress')
    expect(result[0]).toHaveProperty('timestamp')
    expect(result[0]).toHaveProperty('referrerId')
  })
})
