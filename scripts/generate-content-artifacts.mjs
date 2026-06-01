import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  getSiteShellContent,
  getStructuredPageContent,
  listPageInventory,
  listStructuredPages,
} from '../shared/siteContent.js'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(scriptDir, '..')
const generatedDir = resolve(rootDir, 'functions', 'src', 'generated')

async function ensureGeneratedDirectory() {
  await mkdir(generatedDir, { recursive: true })
}

function buildSiteContentPayload() {
  const structuredPageSummaries = listStructuredPages()

  return {
    generatedAt: new Date().toISOString(),
    siteShell: getSiteShellContent(),
    structuredPageSummaries,
    pageInventory: listPageInventory(),
    pages: Object.fromEntries(
      structuredPageSummaries.map((page) => [page.key, getStructuredPageContent(page.key)]),
    ),
  }
}

async function writeGeneratedJson(filename, payload) {
  const targetPath = resolve(generatedDir, filename)
  await writeFile(targetPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

async function copyRequiredArtifact(sourceRelativePath) {
  const sourcePath = resolve(rootDir, sourceRelativePath)
  const filename = sourceRelativePath.split('/').at(-1)
  const targetPath = resolve(generatedDir, filename)

  await copyFile(sourcePath, targetPath)
}

async function main() {
  await ensureGeneratedDirectory()
  await writeGeneratedJson('siteContent.json', buildSiteContentPayload())

  await Promise.all([
    copyRequiredArtifact('public/livePropertyCatalog.json'),
    copyRequiredArtifact('public/livePropertySummaryCatalog.json'),
    copyRequiredArtifact('public/liveCharterCatalog.json'),
  ])
}

main().catch((error) => {
  console.error('Unable to generate Functions content artifacts.')
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
