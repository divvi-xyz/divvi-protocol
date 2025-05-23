import { ResultDirectory } from './resultDirectory'
import path from 'path'

describe('ResultDirectory', () => {
  it('should return correct file paths', () => {
    const datadir = 'test-data'
    const name = 'test-protocol'
    const startTimestamp = new Date('2024-01-01')
    const endTimestampExclusive = new Date('2024-02-01')

    const resultDir = new ResultDirectory({
      datadir,
      name,
      startTimestamp,
      endTimestampExclusive,
    })

    const expectedBasePath = path.join(
      datadir,
      name,
      '2024-01-01T00:00:00.000Z_2024-02-01T00:00:00.000Z',
    )

    expect(resultDir.kpiFilePath).toBe(path.join(expectedBasePath, 'kpi.csv'))
    expect(resultDir.rewardsFilePath).toBe(
      path.join(expectedBasePath, 'rewards.csv'),
    )
    expect(resultDir.safeTransactionsFilePath).toBe(
      path.join(expectedBasePath, 'safe-transactions.json'),
    )
  })
})
