import axios from 'axios'
import { ResultDirectory } from '../../src/resultDirectory'

const PROSPERITY_PASSPORT_URL =
  'https://prosperity-passport-backend-production.up.railway.app/api/accounts'
const PROSPERITY_PASSPORT_HEADERS = {
  'x-api-key': process.env.PROSPERITY_PASSPORT_API_KEY!,
  accept: 'application/json',
  'Content-Type': 'application/json',
}

interface ProsperityPassportData {
  eoas: string[]
  level: number
}

function calculateQualityUserScore(
  users: string[],
  userToLevel: Record<string, number>,
) {
  let score = 0
  for (const user of users) {
    score += userToLevel[user] ?? 0
  }
  return score / users.length
}

export async function getQualityUserScores(
  usersPerReferrer: Record<string, string[]>,
  resultDirectory: ResultDirectory,
): Promise<Record<string, number>> {
  const response = await axios.get(PROSPERITY_PASSPORT_URL, {
    headers: PROSPERITY_PASSPORT_HEADERS,
  })
  const prosperityPassportData = response.data as ProsperityPassportData[]
  await resultDirectory.writeProsperityPassportData(prosperityPassportData)

  const userToLevel = prosperityPassportData.reduce(
    (acc, data) => {
      if (data.eoas === null || data.level === null) return acc
      data.eoas.forEach((eoa) => {
        acc[eoa] = data.level
      })
      return acc
    },
    {} as Record<string, number>,
  )

  return Object.fromEntries(
    Object.entries(usersPerReferrer).map(([referrerId, users]) => [
      referrerId,
      calculateQualityUserScore(users, userToLevel),
    ]),
  )
}
