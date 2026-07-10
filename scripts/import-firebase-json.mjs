import { spawnSync } from 'node:child_process'

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: false,
    ...options,
  })

  if (result.error) {
    throw result.error
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    process.exit(result.status)
  }
}

const forwardedArgs = process.argv.slice(2)

if (process.platform === 'win32') {
  const npmArgs = ['--prefix', 'functions', 'run', 'import:firestore-json', '--', ...forwardedArgs]
  run(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm', ...npmArgs])
} else {
  run('npm', ['--prefix', 'functions', 'run', 'import:firestore-json', '--', ...forwardedArgs])
}
