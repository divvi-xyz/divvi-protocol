// utils/uploadToGCS.ts
import { Storage, TransferManager } from '@google-cloud/storage'

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

  if (!dryRun) {
    await transferManager.uploadManyFiles(filePaths)
  }

  for (const filePath of filePaths) {
    console.log(`${filePath} uploaded to gs://${bucketName}/${filePath}`)
  }
}
