const { readFileSync, readdirSync } = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '..')
const legacyVendorToken = ['w', 'i', 'x'].join('')
const forbiddenPattern = new RegExp(
  `${legacyVendorToken}static|static\\.${legacyVendorToken}static|${legacyVendorToken}`,
  'i',
)

const ignoredPathParts = new Set([
  '.git',
  'node_modules',
  'dist',
  'coverage',
])

const ignoredRelativePaths = new Set([
  'firebase-debug.log',
  path.join('functions', 'package-lock.json'),
])

function shouldIgnore(relativePath) {
  if (ignoredRelativePaths.has(relativePath)) {
    return true
  }

  return relativePath.split(path.sep).some((part) => ignoredPathParts.has(part))
}

function isBinaryBuffer(buffer) {
  const sampleSize = Math.min(buffer.length, 8000)

  for (let index = 0; index < sampleSize; index += 1) {
    if (buffer[index] === 0) {
      return true
    }
  }

  return false
}

function collectFiles(directory, files = []) {
  const entries = readdirSync(directory, { withFileTypes: true })

  entries.forEach((entry) => {
    const absolutePath = path.join(directory, entry.name)
    const relativePath = path.relative(repoRoot, absolutePath)

    if (shouldIgnore(relativePath)) {
      return
    }

    if (entry.isDirectory()) {
      collectFiles(absolutePath, files)
      return
    }

    if (entry.isFile()) {
      files.push({ absolutePath, relativePath })
    }
  })

  return files
}

function scanFile({ absolutePath, relativePath }) {
  const buffer = readFileSync(absolutePath)

  if (isBinaryBuffer(buffer)) {
    return null
  }

  const content = buffer.toString('utf8')
  const match = forbiddenPattern.exec(content)

  if (!match) {
    return null
  }

  const lineNumber = content.slice(0, match.index).split('\n').length
  return `${relativePath}:${lineNumber}`
}

const files = collectFiles(repoRoot)
const hits = files
  .map((file) => scanFile(file))
  .filter(Boolean)
  .sort((left, right) => left.localeCompare(right))

if (hits.length > 0) {
  console.error('Forbidden legacy vendor string found:')
  hits.forEach((hit) => console.error(`- ${hit}`))
  process.exit(1)
}

console.log(`No forbidden legacy vendor strings found across ${files.length} files.`)
