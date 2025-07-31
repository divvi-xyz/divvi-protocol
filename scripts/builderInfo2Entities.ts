import yargs from 'yargs'
import { parse } from 'csv-parse/sync'
import fs from 'fs'

interface BuilderInfoRow {
  'Divvi Identifier': string
  'App Name': string
  'Twitter Handle': string
  'Discord Username': string
  'Telegram Handle': string
}

interface EntityRow {
  referrerId: string
  appName: string
  twitterHandle: string
  telegramHandle: string
  discordUsername: string
}

function parseArgs() {
  return yargs
    .option('builder-info-csv', {
      description: 'The file containing the builder info',
      type: 'string',
      demandOption: true,
    })
    .option('output-json', {
      description: 'The file to write the output to',
      type: 'string',
      demandOption: true,
    })
    .parseSync()
}

export async function main(args: ReturnType<typeof parseArgs>) {
  const builderInfo = parse(fs.readFileSync(args.builderInfoCsv, 'utf8'), {
    columns: true,
  }) as BuilderInfoRow[]

  const entities: EntityRow[] = builderInfo.map((row) => {
    return {
      referrerId: row['Divvi Identifier'].toLowerCase(),
      appName: row['App Name'],
      twitterHandle: row['Twitter Handle'],
      telegramHandle: row['Telegram Handle'],
      discordUsername: row['Discord Username'],
    }
  })

  fs.writeFileSync(args.outputJson, JSON.stringify(entities, null, 2))
}

if (require.main === module) {
  main(parseArgs()).catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
