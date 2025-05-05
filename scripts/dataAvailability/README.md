This directory contains an example script for publishing (unverified) data to the Data Availability layer.

This script fetches transfers for a given ERC20 token across a given block range on a specified network and counts
how many transfers that users had within that block range. It will write the results to a specified output file, and if
the `--upload` parameter is set, will upload the data to a Data Availability contract at the specified
`--data-availability-address`, using the account specified by the `MNEMONIC` environment variable.

The script can be invoked e.g.:

```
yarn ts-node scripts/dataAvailability/getTokenTransfers.ts   --token-address 0x471EcE3750Da237f93B8E339c536989b8978a438   --network celo-mainnet   --start-block 34304880   --end-block 34304900   --output-file out.csv --data-availability-address=<ADDRESS_HERE>
```
