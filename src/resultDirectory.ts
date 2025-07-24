import path, { dirname } from 'path'
import { copyFile, readFile, writeFile, mkdir } from 'fs/promises'
import { stringify } from 'csv-stringify/sync'
import { toPeriodFolderName } from '../scripts/utils/dateFormatting'
import { parse } from 'csv-parse/sync'

export interface KpiRow {
  referrerId: string
  userAddress: string
  kpi: string
  metadata?: { [key: string]: number }
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
    return path.join(this.resultsDirectory, 'rewards')
  }

  get builderSlicesFileSuffix() {
    return path.join(this.resultsDirectory, 'builder-slices')
  }

  get userSlicesFileSuffix() {
    return path.join(this.resultsDirectory, 'user-slices')
  }

  get excludeListFileSuffix() {
    return path.join(this.resultsDirectory, 'exclude-list')
  }

  includeListFilePath(fileName: string) {
    return path.join(this.resultsDirectory, `include-${fileName}`)
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

  async _readJson(filePath: string) {
    return JSON.parse(await readFile(`${filePath}.json`, 'utf-8'))
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
    await mkdir(dirname(this.kpiFileSuffix), { recursive: true })
    return await Promise.all([
      this._writeCsv(this.kpiFileSuffix, kpi),
      this._writeJson(this.kpiFileSuffix, kpi),
    ])
  }

  async writeExcludeList(list: any[]) {
    await mkdir(dirname(this.excludeListFileSuffix), { recursive: true })
    return await Promise.all([
      this._writeCsv(this.excludeListFileSuffix, list),
      this._writeJson(this.excludeListFileSuffix, list),
    ])
  }

  async readKpi() {
    return (await this._readJson(this.kpiFileSuffix)) as KpiRow[]
  }

  async readReferrals() {
    return (await this._readCsv(this.referralsFileSuffix)) as ReferralRow[]
  }

  writeIncludeList(fileName: string) {
    return copyFile(fileName, this.includeListFilePath(fileName))
  }

  async writeBuilderSlices(slices: any[]) {
    await mkdir(dirname(this.builderSlicesFileSuffix), { recursive: true })
    return await Promise.all([
      this._writeCsv(this.builderSlicesFileSuffix, slices),
      this._writeJson(this.builderSlicesFileSuffix, slices),
    ])
  }

  async writeUserSlices(slices: any[]) {
    await mkdir(dirname(this.userSlicesFileSuffix), { recursive: true })
    return await Promise.all([
      this._writeCsv(this.userSlicesFileSuffix, slices),
      this._writeJson(this.userSlicesFileSuffix, slices),
    ])
  }
}
