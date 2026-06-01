const { formatFirebaseDoctorReport, hasBlockingFirebaseIssues, runFirebaseDoctor } = require('./firebaseProjectChecks.cjs')

async function main() {
  const report = await runFirebaseDoctor()
  process.stdout.write(`${formatFirebaseDoctorReport(report)}\n`)
  process.exitCode = hasBlockingFirebaseIssues(report) ? 1 : 0
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Firebase doctor failed.'}\n`)
  process.exitCode = 1
})
