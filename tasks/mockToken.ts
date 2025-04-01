import { task } from 'hardhat/config'
import { deployContract } from './helpers/deployHelpers'

task('mock-token:deploy', 'Deploy mock ERC-20 token').setAction(
  async (_, hre) => {
    await deployContract(hre, 'MockERC20', ['Mock ERC20', 'MOCK'])
  },
)
