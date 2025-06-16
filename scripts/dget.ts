import yargs from 'yargs'
import { listGCSFiles } from './utils/uploadFileToCloudStorage'
import path from 'path'
import fs from 'fs'
import axios from 'axios'

function parseArgs() {
  return yargs
    .option('datadir', {
      description: 'the directory to store the results',
      type: 'string',
      default: 'rewards',
    })
    .option('bucket-name', {
      description: 'the bucket name',
      type: 'string',
      default: 'divvi-campaign-data-production',
    })
    .strict()
    .parseSync()
}

async function downloadFile({
  url,
  outputPath,
}: {
  url: string
  outputPath: string
}) {
  const dir = path.dirname(outputPath)
  console.log(`${outputPath}`)
  fs.mkdirSync(dir, { recursive: true })

  const response = await axios.get(url, { responseType: 'stream' })
  const writer = fs.createWriteStream(outputPath)

  response.data.pipe(writer)

  return new Promise<void>((resolve, reject) => {
    writer.on('finish', resolve)
    writer.on('error', reject)
  })
}

async function main(args: ReturnType<typeof parseArgs>) {
  const fileMetadata = await listGCSFiles(args['bucket-name'])
  for (const fileMetadatum of fileMetadata) {
    const pathParts = fileMetadatum.name.split('/')
    const destination = [args['datadir'], ...pathParts.slice(1)].join('/')
    await downloadFile({ url: fileMetadatum.url, outputPath: destination })
  }
}

// Only run main if this file is being executed directly
if (require.main === module) {
  main(parseArgs()).catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
