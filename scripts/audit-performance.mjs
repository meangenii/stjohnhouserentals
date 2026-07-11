import { access, readFile, readdir, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(scriptDir, '..')
const distDir = resolve(rootDir, 'dist')
const assetsDir = resolve(distDir, 'assets')

function formatBytes(bytes) {
  const value = Number(bytes) || 0

  if (value < 1024) {
    return `${value} B`
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`
  }

  return `${(value / (1024 * 1024)).toFixed(2)} MB`
}

async function pathExists(pathname) {
  try {
    await access(pathname)
    return true
  } catch {
    return false
  }
}

async function listFiles(directory) {
  if (!(await pathExists(directory))) {
    return []
  }

  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map(async (entry) => {
        const pathname = resolve(directory, entry.name)
        const fileStats = await stat(pathname)

        return {
          bytes: fileStats.size,
          name: entry.name,
          path: pathname,
        }
      }),
  )

  return files.sort((left, right) => right.bytes - left.bytes)
}

async function readText(pathname, fallback = '') {
  try {
    return await readFile(pathname, 'utf8')
  } catch {
    return fallback
  }
}

function getEnvValue(envText, key) {
  const match = envText.match(new RegExp(`^${key}=(.*)$`, 'm'))
  return match ? match[1].trim() : ''
}

async function getJsonPayloadFiles() {
  const filenames = ['livePropertyCatalog.json', 'livePropertySummaryCatalog.json', 'liveCharterCatalog.json']
  const files = []

  for (const filename of filenames) {
    const pathname = resolve(distDir, filename)

    if (!(await pathExists(pathname))) {
      continue
    }

    files.push({
      bytes: (await stat(pathname)).size,
      name: filename,
      path: pathname,
    })
  }

  return files.sort((left, right) => right.bytes - left.bytes)
}

async function main() {
  const [assetFiles, jsonFiles, envText, firebaseJsonText] = await Promise.all([
    listFiles(assetsDir),
    getJsonPayloadFiles(),
    readText(resolve(rootDir, '.env')),
    readText(resolve(rootDir, 'firebase.json')),
  ])
  const apiBaseUrl = getEnvValue(envText, 'VITE_API_BASE_URL') || '(unset)'
  const staticPublicEnvKeys = [
    'VITE_PUBLIC_SITE_CONTENT_SOURCE',
    'VITE_PUBLIC_PROPERTY_DATA_SOURCE',
    'VITE_PUBLIC_CHARTER_DATA_SOURCE',
  ]
  const staticPublicEnvVars = staticPublicEnvKeys.filter((key) => getEnvValue(envText, key))
  const firebaseJson = firebaseJsonText ? JSON.parse(firebaseJsonText) : {}
  const hostingHeaders = Array.isArray(firebaseJson?.hosting?.headers) ? firebaseJson.hosting.headers : []
  const hasImmutableAssetHeaders = hostingHeaders.some((entry) =>
    String(entry?.source ?? '') === '/assets/**' &&
    entry.headers?.some((header) => String(header?.key ?? '').toLowerCase() === 'cache-control' && /immutable/i.test(header?.value ?? '')),
  )
  const hasSharedJsonCacheHeaders = hostingHeaders.some((entry) =>
    String(entry?.source ?? '') === '**/*.json' &&
    entry.headers?.some(
      (header) => String(header?.key ?? '').toLowerCase() === 'cache-control' && !/no-store/i.test(header?.value ?? ''),
    ),
  )
  const jsFiles = assetFiles.filter((file) => file.name.endsWith('.js'))
  const cssFiles = assetFiles.filter((file) => file.name.endsWith('.css'))
  const totalJsBytes = jsFiles.reduce((total, file) => total + file.bytes, 0)
  const totalCssBytes = cssFiles.reduce((total, file) => total + file.bytes, 0)
  const staleStaticSiteContentPath = resolve(distDir, 'liveSiteContent.json')
  const staleStaticPropertyDataPath = resolve(distDir, 'property-data')
  const failures = []

  if (apiBaseUrl !== '/api') {
    failures.push(`Expected VITE_API_BASE_URL=/api, received ${apiBaseUrl}.`)
  }

  if (staticPublicEnvVars.length > 0) {
    failures.push(`Remove static public data env flags: ${staticPublicEnvVars.join(', ')}.`)
  }

  if (!hasImmutableAssetHeaders) {
    failures.push('Missing immutable Firebase Hosting cache headers for /assets/**.')
  }

  if (hasSharedJsonCacheHeaders) {
    failures.push('Generated JSON should not use shared cache headers when publishes must be visible immediately.')
  }

  if (await pathExists(staleStaticSiteContentPath)) {
    failures.push('dist/liveSiteContent.json is present; public site content should come from /api for immediate publish visibility.')
  }

  if (await pathExists(staleStaticPropertyDataPath)) {
    failures.push('dist/property-data is present; property details should come from /api for immediate publish visibility.')
  }

  console.log('Performance audit')
  console.log(`API base: ${apiBaseUrl}`)
  console.log('Mutable CMS public reads: /api with browser cache bypass')
  console.log(`JS total: ${formatBytes(totalJsBytes)} across ${jsFiles.length} file${jsFiles.length === 1 ? '' : 's'}`)
  console.log(`CSS total: ${formatBytes(totalCssBytes)} across ${cssFiles.length} file${cssFiles.length === 1 ? '' : 's'}`)

  if (assetFiles.length > 0) {
    console.log('\nLargest assets:')
    assetFiles.slice(0, 10).forEach((file) => {
      console.log(`- ${file.name}: ${formatBytes(file.bytes)}`)
    })
  } else {
    console.log('\nNo dist/assets files found. Run npm.cmd run build first.')
  }

  if (jsonFiles.length > 0) {
    console.log('\nGenerated JSON payloads:')
    jsonFiles.forEach((file) => {
      console.log(`- ${file.name}: ${formatBytes(file.bytes)}`)
    })
  }

  if (failures.length > 0) {
    console.log('\nConfig issues:')
    failures.forEach((failure) => console.log(`- ${failure}`))
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error('Unable to audit performance outputs.')
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
