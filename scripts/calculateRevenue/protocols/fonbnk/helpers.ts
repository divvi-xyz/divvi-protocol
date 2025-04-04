import crypto from 'crypto'

export async function generateSignature(
    clientSecret: string,
    timestamp: string,
    endpoint: string,
  ) {
    const hmac = crypto.createHmac(
      'sha256',
      Buffer.from(clientSecret, 'base64'),
    )
    const stringToSign = `${timestamp}:${endpoint}`
    hmac.update(stringToSign)
    return hmac.digest('base64')
  }