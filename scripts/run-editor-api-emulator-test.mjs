import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PROJECT_ID = 'demo-genericcms-editor'
const firebaseExecutable = process.platform === 'win32' ? 'firebase.cmd' : 'firebase'
const firebaseConfigDirectory = join(tmpdir(), 'genericcms-firebase-config')
const firebaseConfigStoreDirectory = join(firebaseConfigDirectory, 'configstore')
const testCommand = process.platform === 'win32'
  ? 'scripts\\test-editor-api-emulator.cmd'
  : 'node ./scripts/test-editor-api-emulator.mjs'
const firebaseArgs = ['emulators:exec', '--only', 'auth,firestore,functions', '--project', PROJECT_ID, '--log-verbosity', 'QUIET', testCommand]
const executable = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : firebaseExecutable
const executableArgs = process.platform === 'win32'
  ? ['/d', '/s', '/c', `${firebaseExecutable} emulators:exec --only auth,firestore,functions --project ${PROJECT_ID} --log-verbosity QUIET ${testCommand}`]
  : firebaseArgs

mkdirSync(firebaseConfigStoreDirectory, { recursive: true })
writeFileSync(
  join(firebaseConfigStoreDirectory, 'firebase-tools.json'),
  JSON.stringify({ motd: { fetched: Date.now() } }),
)

const child = spawn(
  executable,
  executableArgs,
  {
    env: {
      ...process.env,
      DEBUG: '',
      GCLOUD_PROJECT: PROJECT_ID,
      npm_config_offline: 'true',
      XDG_CONFIG_HOME: firebaseConfigDirectory,
    },
    stdio: 'inherit',
  },
)

child.once('error', (error) => {
  console.error(`Unable to start the Firebase emulator test: ${error.message}`)
  process.exitCode = 1
})

child.once('exit', (code, signal) => {
  if (signal) {
    console.error(`Firebase emulator test stopped by signal ${signal}.`)
    process.exitCode = 1
    return
  }

  process.exitCode = code ?? 1
})
