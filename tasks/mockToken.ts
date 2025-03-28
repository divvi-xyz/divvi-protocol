import { task } from 'hardhat/config'
import { deployContract } from './deployHelpers'

task('deploy:mock-token', 'Deploy mock ERC-20 token').setAction(
  async (_, hre) => {
    await deployContract(hre, 'MockERC20', ['Mock ERC20', 'MOCK'])
  },
)
