import { Address, stringToHex } from 'viem'
import { HardhatRuntimeEnvironment } from 'hardhat/types'

interface ReferrerConfig {
  protocolIds: string[]
  rewardRates: bigint[]
}

const REFERRERS: Record<string, ReferrerConfig> = {
  leefy: {
    protocolIds: ['dompounder', 'zoot', 'bartender'],
    rewardRates: [
      BigInt('1000000000000000000'),
      BigInt('1000000000000000000'),
      BigInt('1000000000000000000'),
    ],
  },
  marianashot: {
    protocolIds: ['memenfts', 'zoot'],
    rewardRates: [BigInt('1000000000000000000'), BigInt('1000000000000000000')],
  },
}

export async function populateRegistry({
  hre,
  contractAddress,
}: {
  hre: HardhatRuntimeEnvironment
  contractAddress: Address
}) {
  const contract = await hre.viem.getContractAt('Registry', contractAddress)

  const referrerIds = Object.keys(REFERRERS)

  const walletClients = [...(await hre.viem.getWalletClients())]
  // Register the referrers.
  for (const [referrer, { protocolIds, rewardRates }] of Object.entries(
    REFERRERS,
  )) {
    const walletClient = walletClients.pop()
    if (!walletClient) {
      throw new Error(
        'No more wallet clients. Increase `count`: https://hardhat.org/hardhat-network/docs/reference#accounts.',
      )
    }
    const response = await contract.write.registerReferrer([
      stringToHex(referrer, { size: 32 }),
      protocolIds.map((id) => stringToHex(id, { size: 32 })),
      rewardRates,
      walletClient.account.address,
    ])
    console.log(
      `Referrer ${referrer}: ${protocolIds}, ${rewardRates}, ${response}`,
    )
  }

  // Generate some referals.
  let referrerCount = 0
  let protocolCount = 0
  while (walletClients.length > 0) {
    const walletClient = walletClients.pop()!

    const contract = await hre.viem.getContractAt('Registry', contractAddress, {
      client: { wallet: walletClient },
    })

    // This makes sure we use valid values, but can cause repetitive
    // referal behavior.
    const referrerId = referrerIds[referrerCount % referrerIds.length]
    referrerCount++
    const protocolIds = REFERRERS[referrerId].protocolIds
    const protocolId = protocolIds[protocolCount % protocolIds.length]
    protocolCount++

    const response = await contract.write.registerReferrals([
      stringToHex(referrerId, { size: 32 }),
      [stringToHex(protocolId, { size: 32 })],
    ])

    console.log(
      `Referal ${walletClient.account.address}: ${referrerId}, ${protocolId}, ${response}`,
    )
  }
}
