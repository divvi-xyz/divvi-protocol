import { expect } from 'chai'
import hre from 'hardhat'

describe('Example', () => {
    async function deployContract() {
        const ExampleContract = await hre.ethers.getContractFactory('Example')
        const exampleContractDeployResult = await ExampleContract.deploy('FOO', 'BAR')
        const exampleContractAddress = await exampleContractDeployResult.getAddress()

        const exampleContract = await hre.ethers.getContractAt('Example', exampleContractAddress)
        return {
            exampleContract,
            exampleContractAddress
        }
    }

    it('deploys', async function () {
        const { exampleContract } = await deployContract()
        expect(exampleContract).to.exist
      })

    it('sets the right name and symbol', async function () {
        const { exampleContract } = await deployContract()
        expect(await exampleContract.name()).to.equal('FOO')
        expect(await exampleContract.symbol()).to.equal('BAR')
    })
})