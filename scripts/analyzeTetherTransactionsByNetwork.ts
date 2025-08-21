#!/usr/bin/env ts-node

interface KpiEntry {
  kpi: number
  referrerId: string
  userAddress: string
  metadata: {
    [networkName: string]: {
      txCount: number
      addresses: string[]
      totalValue: string
    }
  }
}

interface NetworkBreakdown {
  [networkName: string]: {
    totalTransactions: number
    uniqueEntries: number
  }
}

async function fetchKpiData(url: string): Promise<KpiEntry[]> {
  console.log(`Fetching KPI data from: ${url}`)
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(
      `Failed to fetch data: ${response.status} ${response.statusText}`,
    )
  }

  const kpiData = (await response.json()) as KpiEntry[]
  console.log(`Successfully fetched ${kpiData.length} entries`)
  return kpiData
}

function analyzeTransactionsByNetwork(kpiData: KpiEntry[]): NetworkBreakdown {
  console.log(`Processing ${kpiData.length} entries...`)

  const networkBreakdown: NetworkBreakdown = {}

  // Loop through each KPI entry
  for (const entry of kpiData) {
    // Loop through each network in the metadata
    for (const [networkName, networkData] of Object.entries(entry.metadata)) {
      // Initialize network entry if it doesn't exist
      if (!networkBreakdown[networkName]) {
        networkBreakdown[networkName] = {
          totalTransactions: 0,
          uniqueEntries: 0,
        }
      }

      // Add transaction count for this network
      networkBreakdown[networkName].totalTransactions += networkData.txCount
      networkBreakdown[networkName].uniqueEntries += 1
    }
  }

  return networkBreakdown
}

function displayResults(breakdown: NetworkBreakdown): void {
  console.log('\n=== Transaction Breakdown by Network ===\n')

  // Sort networks by total transactions (descending)
  const sortedNetworks = Object.entries(breakdown).sort(
    ([, a], [, b]) => b.totalTransactions - a.totalTransactions,
  )

  // Calculate totals
  const totalTransactions = sortedNetworks.reduce(
    (sum, [, data]) => sum + data.totalTransactions,
    0,
  )
  const totalEntries = sortedNetworks.reduce(
    (sum, [, data]) => sum + data.uniqueEntries,
    0,
  )

  // Display each network
  for (const [networkName, data] of sortedNetworks) {
    const percentage = (
      (data.totalTransactions / totalTransactions) *
      100
    ).toFixed(2)
    const avgTxPerEntry = (data.totalTransactions / data.uniqueEntries).toFixed(
      2,
    )

    console.log(`${networkName}:`)
    console.log(
      `  Total Transactions: ${data.totalTransactions.toLocaleString()} (${percentage}%)`,
    )
    console.log(`  Unique Entries: ${data.uniqueEntries.toLocaleString()}`)
    console.log(`  Avg Tx per Entry: ${avgTxPerEntry}`)
    console.log('')
  }

  console.log('=== Summary ===')
  console.log(`Total Networks: ${sortedNetworks.length}`)
  console.log(`Total Transactions: ${totalTransactions.toLocaleString()}`)
  console.log(`Total KPI Entries: ${totalEntries.toLocaleString()}`)
  console.log(
    `Average Transactions per Entry: ${(totalTransactions / totalEntries).toFixed(2)}`,
  )
}

// Main execution
async function main(): Promise<void> {
  const kpiUrl =
    'https://storage.googleapis.com/divvi-campaign-data-production/kpi/tether-v0/2025-07-28T00:00:00.000Z_2025-08-30T00:00:00.000Z/kpi.json'

  try {
    const kpiData = await fetchKpiData(kpiUrl)
    const breakdown = analyzeTransactionsByNetwork(kpiData)
    displayResults(breakdown)
  } catch (error) {
    console.error('Error analyzing transactions:', error)
    process.exit(1)
  }
}

// Run the script if called directly
if (require.main === module) {
  main()
}
