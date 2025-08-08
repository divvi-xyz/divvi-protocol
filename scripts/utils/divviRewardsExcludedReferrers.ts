import { Readable } from 'node:stream'
import * as sax from 'sax'
import * as unzipper from 'unzipper'
import { Address, isAddress } from 'viem'

const valoraEntities: { referrerId: Address; shouldWarn?: boolean }[] = []

// https://sanctionslist.ofac.treas.gov/Home/SdnList
const OFAC_SDN_ZIP_URL =
  'https://sanctionslistservice.ofac.treas.gov/api/download/SDN_XML.ZIP'

// Cache for OFAC SDN addresses to avoid multiple fetches
let cachedOfacSdnAddresses:
  | { referrerId: Address; shouldWarn: boolean }[]
  | null = null

export async function getOfacSdnAddresses(): Promise<
  { referrerId: Address; shouldWarn: boolean }[]
> {
  // Return cached result if available
  if (cachedOfacSdnAddresses !== null) {
    return cachedOfacSdnAddresses
  }

  const res = await fetch(OFAC_SDN_ZIP_URL)
  if (!res.ok) {
    throw new Error(
      `Failed to fetch OFAC SDN ZIP: ${res.status} ${res.statusText}`,
    )
  }

  return new Promise((resolve, reject) => {
    const addresses = new Set<Address>()

    if (!res.body) {
      return reject(new Error('No response body from OFAC SDN ZIP endpoint'))
    }

    const xmlParser = sax.createStream(true, { trim: true })
    xmlParser.on('text', (text) => {
      if (isAddress(text)) {
        addresses.add(text.toLowerCase() as Address)
      }
    })
    xmlParser.on('end', () => {
      const result = [...addresses].map((address) => ({
        referrerId: address,
        shouldWarn: true,
      }))
      // Cache the result
      cachedOfacSdnAddresses = result
      resolve(result)
    })
    xmlParser.on('error', reject)

    Readable.fromWeb(res.body).pipe(unzipper.ParseOne()).pipe(xmlParser)
  })
}

export async function getDivviRewardsExcludedReferrers(): Promise<
  Record<
    string,
    {
      referrerId: string
      shouldWarn?: boolean
    }
  >
> {
  const ofacSdnAddresses = await getOfacSdnAddresses()

  const excludedReferrersMap: Record<
    string,
    {
      referrerId: string
      shouldWarn?: boolean
    }
  > = {}
  valoraEntities.concat(ofacSdnAddresses).forEach((referrer) => {
    excludedReferrersMap[referrer.referrerId.toLowerCase()] = {
      referrerId: referrer.referrerId.toLowerCase(),
      shouldWarn: !!referrer.shouldWarn,
    }
  })
  return excludedReferrersMap
}
