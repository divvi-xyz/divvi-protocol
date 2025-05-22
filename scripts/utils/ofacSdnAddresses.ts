import { Readable } from 'node:stream'
import * as sax from 'sax'
import * as unzipper from 'unzipper'
import { Address, isAddress } from 'viem'

// https://sanctionslist.ofac.treas.gov/Home/SdnList
const OFAC_SDN_ZIP_URL =
  'https://sanctionslistservice.ofac.treas.gov/api/download/SDN_XML.ZIP'

export async function getOfacSdnAddresses(): Promise<Address[]> {
  const res = await fetch(OFAC_SDN_ZIP_URL)
  if (!res.ok) {
    throw new Error(
      `Failed to fetch OFAC SDN ZIP: ${res.status} ${res.statusText}`,
    )
  }

  return new Promise<Address[]>((resolve, reject) => {
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
    xmlParser.on('end', () => resolve([...addresses]))
    xmlParser.on('error', reject)

    Readable.fromWeb(res.body).pipe(unzipper.ParseOne()).pipe(xmlParser)
  })
}
