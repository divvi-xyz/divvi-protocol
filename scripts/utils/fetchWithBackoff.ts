import fetch, { RequestInit, Response } from 'node-fetch'

export async function fetchWithBackoff(
  url: string,
  options: RequestInit,
  retries: number = 5,
  delay: number = 1000,
): Promise<Response> {
  try {
    const response = await fetch(url, options)
    if (!response.ok && response.status === 429 && retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay))
      return fetchWithBackoff(url, options, retries - 1, delay * 2)
    }
    return response
  } catch (error) {
    if (retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay))
      return fetchWithBackoff(url, options, retries - 1, delay * 2)
    }
    throw error
  }
}
