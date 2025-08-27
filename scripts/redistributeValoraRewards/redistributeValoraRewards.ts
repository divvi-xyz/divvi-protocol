import yargs from 'yargs'

async function getArgs() {
    const argv = await yargs
      .env('')
      .option('protocol', {
        description:
          'The protocol to redistribute valora rewards for',
        type: 'string',
      }).argv
  
    return {
      protocol: argv['protocol'],
    }
  }

  export async function redistributeValoraRewards(
    args: Awaited<ReturnType<typeof getArgs>>,
  ) {

  }


// Only run if this file is being run directly
if (require.main === module) {
    getArgs()
      .then((args) => redistributeValoraRewards(args))
      .catch((error) => {
        console.error(error)
        process.exitCode = 1
      })
  }