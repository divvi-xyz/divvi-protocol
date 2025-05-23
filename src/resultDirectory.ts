import path from 'path'
import { readFile, writeFile } from 'fs/promises'
import { stringify } from 'csv-stringify/sync'
import { toPeriodFolderName } from '../scripts/utils/dateFormatting'
import { parse } from 'csv-parse/sync'

export interface KpiRow {
  referrerId: string
  userAddress: string
  kpi: string
}

export class ResultDirectory {
  private readonly resultsDirectory: string

  constructor({
    datadir,
    name,
    startTimestamp,
    endTimestampExclusive,
  }: {
    datadir: string
    name: string
    startTimestamp: Date
    endTimestampExclusive: Date
  }) {
    this.resultsDirectory = path.join(
      datadir,
      name,
      toPeriodFolderName({ startTimestamp, endTimestampExclusive }),
    )
  }

  get kpiFilePath() {
    return path.join(this.resultsDirectory, 'kpi.csv')
  }

  get rewardsFilePath() {
    return path.join(this.resultsDirectory, 'rewards.csv')
  }

  get safeTransactionsFilePath() {
    return path.join(this.resultsDirectory, 'safe-transactions.json')
  }

  async _read(filePath: string) {
    return parse((await readFile(filePath, 'utf-8')).toString(), {
      skip_empty_lines: true,
      delimiter: ',',
      columns: true,
    })
  }

  async _write(filePath: string, data: any[]) {
    return writeFile(filePath, stringify(data, { header: true }), {
      encoding: 'utf-8',
    })
  }

  writeRewards(rewards: any[]) {
    return this._write(this.rewardsFilePath, rewards)
  }

  async readKpi() {
    return (await this._read(this.kpiFilePath)) as KpiRow[]
  }
}
