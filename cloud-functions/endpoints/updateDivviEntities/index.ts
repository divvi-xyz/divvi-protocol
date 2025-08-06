import { z } from 'zod'
import { loadSharedConfig } from '../../config/loadSharedConfig'
import { createEndpoint } from '../../services/createEndpoint'
import { google } from 'googleapis'
import { Storage } from '@google-cloud/storage'
import { logger } from '../../log'

const requestSchema = z.object({
  method: z.custom((arg) => arg === 'POST', 'only POST requests are allowed'),
  body: z.object({
    dryRun: z.boolean().optional().default(false),
  }),
})

const loadConfig = () =>
  loadSharedConfig({
    GOOGLE_SERVICE_ACCOUNT_JSON: z.string(),
    BUILDER_INFO_GOOGLE_SHEET_ID: z.string(),
    DIVVI_ENTITIES_BUCKET_NAME: z.string(),
  })

interface SheetRow {
  divviIdentifier: string
  appName: string
  twitterHandle: string
  telegramHandle: string
  discordUsername: string
}

interface EntityRow {
  referrerId: string
  appName: string
  twitterHandle: string
  telegramHandle: string
  discordUsername: string
}

async function readFromGoogleSheets(
  config: ReturnType<typeof loadConfig>,
): Promise<EntityRow[]> {
  // Get credentials from environment variable
  const base64Decoded = Buffer.from(
    config.GOOGLE_SERVICE_ACCOUNT_JSON,
    'base64',
  ).toString('utf8')
  const credentials = JSON.parse(base64Decoded)

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })

  const sheets = google.sheets({ version: 'v4', auth })
  const spreadsheetId = config.BUILDER_INFO_GOOGLE_SHEET_ID
  const range = 'Sheet1!A:E' // Assuming columns A-E contain the required data

  // Get all values from the sheet
  const sheetsResponse = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  })

  const values = sheetsResponse.data.values || []

  // Skip header row if it exists and map the data to our interface
  const rows: SheetRow[] = values.slice(1).map((row) => ({
    divviIdentifier: row[0] || '',
    appName: row[1] || '',
    twitterHandle: row[2] || '',
    telegramHandle: row[3] || '',
    discordUsername: row[4] || '',
  }))

  // Transform to entities format (similar to builderInfo2Entities.ts)
  const entities: EntityRow[] = rows
    .filter((row) => row.divviIdentifier) // Filter out empty identifiers
    .map((row) => ({
      referrerId: row.divviIdentifier.toLowerCase(),
      appName: row.appName,
      twitterHandle: row.twitterHandle,
      telegramHandle: row.telegramHandle,
      discordUsername: row.discordUsername,
    }))

  return entities
}

async function uploadToGoogleCloudStorage(
  entities: EntityRow[],
  config: ReturnType<typeof loadConfig>,
  dryRun: boolean,
): Promise<string | null> {
  const storage = new Storage()
  const bucketName = config.DIVVI_ENTITIES_BUCKET_NAME
  const fileName = 'kpi/divvi-entities.json'

  const jsonData = JSON.stringify(entities, null, 2)

  if (dryRun) {
    logger.info(
      {
        entitiesCount: entities.length,
        sampleData: entities.slice(0, 3),
      },
      'Dry run: Would upload entities to GCS',
    )
    return null
  }

  try {
    const bucket = storage.bucket(bucketName)
    const file = bucket.file(fileName)

    await file.save(jsonData, {
      metadata: {
        contentType: 'application/json',
      },
    })

    const publicUrl = `https://storage.googleapis.com/${bucketName}/${fileName}`

    logger.info(
      {
        entitiesCount: entities.length,
        publicUrl,
      },
      'Successfully uploaded entities to GCS',
    )

    return publicUrl
  } catch (error) {
    logger.error(
      {
        error,
        bucketName,
        fileName,
      },
      'Failed to upload entities to GCS',
    )
    throw error
  }
}

export const updateDivviEntities = createEndpoint('updateDivviEntities', {
  loadConfig,
  requestSchema,
  handler: async ({ res, config, parsedRequest }) => {
    try {
      logger.info('Starting divvi entities update process')

      // Read data from Google Sheets
      const entities = await readFromGoogleSheets(config)

      // Upload to Google Cloud Storage
      const uploadUrl = await uploadToGoogleCloudStorage(
        entities,
        config,
        parsedRequest.body.dryRun,
      )

      res.status(200).json({
        success: true,
        entitiesCount: entities.length,
        uploadUrl,
        dryRun: parsedRequest.body.dryRun,
      })
    } catch (error) {
      logger.error(
        {
          error,
        },
        'Failed to update divvi entities',
      )

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  },
})
