// utils/uploadToGCS.ts
import { Storage, TransferManager } from '@google-cloud/storage'

/**
 * Upload specific files to GCS using their full local paths.
 *
 * @param filePaths Array of local file paths (absolute or relative)
 * @param bucketName Target GCS bucket
 */
export async function uploadFilesToGCS(
  filePaths: string[],
  bucketName: string,
) {
  const storage = new Storage()
  const bucket = storage.bucket(bucketName)
  const transferManager = new TransferManager(bucket)

  await transferManager.uploadManyFiles(filePaths)

  for (const filePath of filePaths) {
    console.log(`${filePath} uploaded to gs://${bucketName}/${filePath}`)
  }
}
