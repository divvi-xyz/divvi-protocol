import path from 'path'
import { copyFile, readFile, writeFile } from 'fs/promises'
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

  get kpiFileSuffix() {
    return path.join(this.resultsDirectory, 'kpi')
  }

  get rewardsFileSuffix() {
    return path.join(this.resultsDirectory, 'rewards')
  }

  excludeListFilePath(fileName: string) {
    return path.join(this.resultsDirectory, `exclude-${fileName}`)
  }

  get safeTransactionsFilePath() {
    return path.join(this.resultsDirectory, 'safe-transactions.json')
  }

  async _readCsv(filePath: string) {
    return parse((await readFile(`${filePath}.csv`, 'utf-8')).toString(), {
      skip_empty_lines: true,
      delimiter: ',',
      columns: true,
    })
  }

  async _writeCsv(filePath: string, data: any[]) {
    return writeFile(`${filePath}.csv`, stringify(data, { header: true }), {
      encoding: 'utf-8',
    })
  }

  async _writeJson(filePath: string, data: any[]) {
    return writeFile(`${filePath}.json`, JSON.stringify(data), {
      encoding: 'utf-8',
    })
  }

  writeRewards(rewards: any[]) {
    return Promise.all([
      this._writeCsv(this.rewardsFileSuffix, rewards),
      this._writeJson(this.rewardsFileSuffix, rewards),
    ])
  }

  async readKpi() {
    return (await this._readCsv(this.kpiFileSuffix)) as KpiRow[]
  }

  writeExcludeList(fileName: string) {
    return copyFile(fileName, this.excludeListFilePath(fileName))
  }
}
