import { spawnSync } from 'node:child_process'
import { loadEnv } from 'vite'

function parseArgs(argv) {
  const options = {}

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (!arg.startsWith('--')) {
      continue
    }

    const separatorIndex = arg.indexOf('=')

    if (separatorIndex !== -1) {
      options[arg.slice(2, separatorIndex)] = arg.slice(separatorIndex + 1)
      continue
    }

    const nextArg = argv[index + 1]

    if (!nextArg || nextArg.startsWith('--')) {
      options[arg.slice(2)] = true
      continue
    }

    options[arg.slice(2)] = nextArg
    index += 1
  }

  return options
}

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: false,
  })

  if (result.error) {
    throw result.error
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    process.exit(result.status)
  }
}

function assertSafeApiBaseUrlForStaging() {
  const env = loadEnv('production', process.cwd(), '')
  const configuredApiBaseUrl = String(env.VITE_API_BASE_URL ?? '/api').trim() || '/api'

  if (configuredApiBaseUrl !== '/api') {
    throw new Error(
      `deploy:staging requires VITE_API_BASE_URL=/api so the preview channel stays on the staging API. Received ${configuredApiBaseUrl}.`,
    )
  }
}

const options = parseArgs(process.argv.slice(2))

if (options.help || options.h) {
  process.stdout.write(
    'Usage:\n' +
      '  npm run deploy:staging -- [--channel=staging] [--expires=7d]\n' +
      '\n' +
      'Builds the site, deploys only the siteApiStaging function, and publishes a Hosting preview channel that rewrites /api to siteApiStaging.\n',
  )
  process.exit(0)
}

const channel = String(options.channel ?? 'staging').trim() || 'staging'
const expires = String(options.expires ?? '7d').trim() || '7d'
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const firebaseCommand = process.platform === 'win32' ? 'firebase.cmd' : 'firebase'

assertSafeApiBaseUrlForStaging()
run(npmCommand, ['run', 'build'])
run(firebaseCommand, ['deploy', '--only', 'functions:siteApiStaging'])
run(firebaseCommand, ['hosting:channel:deploy', channel, '--config', 'firebase.staging.json', '--expires', expires])
