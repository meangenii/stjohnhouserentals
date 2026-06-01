const fs = require('fs')
const path = require('path')
const { seedCharterRecords } = require('../src/charterRepository')
const { seedPropertyRecords } = require('../src/propertyRepository')
const { seedSiteContentRecords } = require('../src/siteContentRepository')
const {
  formatFirebaseDoctorReport,
  hasBlockingFirebaseIssues,
  runFirebaseDoctor,
} = require('../../scripts/firebaseProjectChecks.cjs')

function resolveProjectId() {
  if (process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT) {
    return process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT
  }

  const firebasercPath = path.resolve(__dirname, '..', '..', '.firebaserc')

  if (!fs.existsSync(firebasercPath)) {
    return ''
  }

  try {
    const firebaserc = JSON.parse(fs.readFileSync(firebasercPath, 'utf8'))
    return String(firebaserc?.projects?.default ?? '').trim()
  } catch {
    return ''
  }
}

async function main() {
  const replace = process.argv.includes('--replace')
  const projectId = resolveProjectId()
  const doctorReport = await runFirebaseDoctor({ rootDir: path.resolve(__dirname, '..', '..') })

  if (hasBlockingFirebaseIssues(doctorReport)) {
    process.stderr.write(`${formatFirebaseDoctorReport(doctorReport)}\n`)
    process.exitCode = 1
    return
  }

  if (projectId) {
    process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || projectId
    process.env.GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || projectId
  }

  const [siteContent, properties, charters] = await Promise.all([
    seedSiteContentRecords({ replace, actor: 'seed-script' }),
    seedPropertyRecords({ replace, actor: 'seed-script' }),
    seedCharterRecords({ replace, actor: 'seed-script' }),
  ])

  process.stdout.write(
    `${JSON.stringify(
      {
        projectId: process.env.GCLOUD_PROJECT || '',
        replace,
        siteContent,
        properties,
        charters,
      },
      null,
      2,
    )}\n`,
  )
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Firestore seed failed.'}\n`)

  process.exitCode = 1
})
