// utils/uploadToGCS.ts
import { Storage, TransferManager } from '@google-cloud/storage'
import axios from 'axios'

/**
 * Upload specific files to GCS using their full local paths.
 *
 * @param filePaths Array of local file paths (absolute or relative)
 * @param bucketName Target GCS bucket
 * @param dryRun If true, only log what would be uploaded without actually uploading
 */
export async function uploadFilesToGCS(
  filePaths: string[],
  bucketName: string,
  dryRun = false,
) {
  const storage = new Storage()
  const bucket = storage.bucket(bucketName)
  const transferManager = new TransferManager(bucket)

  if (dryRun) {
    for (const filePath of filePaths) {
      console.log(
        `${filePath} would be uploaded to gs://${bucketName}/${filePath}, but this is a dry run`,
      )
    }
  } else {
    await transferManager.uploadManyFiles(filePaths)
    for (const filePath of filePaths) {
      console.log(`${filePath} uploaded to gs://${bucketName}/${filePath}`)
    }
  }
}

export async function listGCSFiles(bucketName: string) {
  const url = `https://storage.googleapis.com/storage/v1/b/${bucketName}/o`

  try {
    const response = await axios.get(url)
    const items: { name: string }[] = response.data.items || []

    const files = items.map((item) => ({
      name: item.name,
      url: `https://storage.googleapis.com/${bucketName}/${item.name}`,
    }))

    return files
  } catch (error) {
    console.error('Error fetching GCS files:', error)
    throw error
  }
}
