import path from 'path'
import { copyFile, readFile, writeFile, mkdir } from 'fs/promises'
import { stringify } from 'csv-stringify/sync'
import { toPeriodFolderName } from '../scripts/utils/dateFormatting'
import { parse } from 'csv-parse/sync'
import { dirname } from 'path'

export interface KpiRow {
  referrerId: string
  userAddress: string
  kpi: string
  segmentedKpi?: { [key: string]: string }
}

interface ReferralRow {
  referrerId: string
  userAddress: string
  timestamp: string
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

  get referralsFileSuffix() {
    return path.join(this.resultsDirectory, 'referrals')
  }

  get rewardsFileSuffix() {
    return path.join(this.resultsDirectory, 'rewards-test')
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
    const stringifiedData = JSON.stringify(data, (_, value) =>
      typeof value === 'bigint' ? value.toString() : value,
    )
    return writeFile(`${filePath}.json`, stringifiedData, {
      encoding: 'utf-8',
    })
  }

  async writeRewards(rewards: any[]) {
    await mkdir(dirname(this.rewardsFileSuffix), { recursive: true })
    return await Promise.all([
      this._writeCsv(this.rewardsFileSuffix, rewards),
      this._writeJson(this.rewardsFileSuffix, rewards),
    ])
  }

  async writeKpi(kpi: any[]) {
    await mkdir(dirname(this.rewardsFileSuffix), { recursive: true })
    return await Promise.all([
      this._writeCsv(this.kpiFileSuffix, kpi),
      this._writeJson(this.kpiFileSuffix, kpi),
    ])
  }

  async readKpi() {
    return (await this._readCsv(this.kpiFileSuffix)) as KpiRow[]
  }

  async readReferrals() {
    return (await this._readCsv(this.referralsFileSuffix)) as ReferralRow[]
  }

  writeExcludeList(fileName: string) {
    return copyFile(fileName, this.excludeListFilePath(fileName))
  }
}
