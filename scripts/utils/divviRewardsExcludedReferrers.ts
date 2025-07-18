import { Readable } from 'node:stream'
import * as sax from 'sax'
import * as unzipper from 'unzipper'
import { Address, isAddress } from 'viem'

const valoraEntities: { referrerId: Address; shouldWarn?: boolean }[] = [
  { referrerId: '0x9ecfe3ddfaf1bb9b55f56b84471406893c5e29ad' }, // Valora app
  // TODO: add VEarn app
]

// https://sanctionslist.ofac.treas.gov/Home/SdnList
const OFAC_SDN_ZIP_URL =
  'https://sanctionslistservice.ofac.treas.gov/api/download/SDN_XML.ZIP'

export async function getOfacSdnAddresses(): Promise<
  { referrerId: Address; shouldWarn: boolean }[]
> {
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
    xmlParser.on('end', () =>
      resolve(
        [...addresses].map((address) => ({
          referrerId: address,
          shouldWarn: true,
        })),
      ),
    )
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
