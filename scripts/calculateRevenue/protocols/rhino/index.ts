export async function calculateRevenue({
  address,
  startTimestamp,
  endTimestamp,
}: {
  address: string
  startTimestamp: Date
  endTimestamp: Date
}): Promise<number> {
  // Use hypersync to get all of the relevant events

  // Use the getTokenPrice logic to get price USD at time of event and convert, aggregate
  return 0
}
