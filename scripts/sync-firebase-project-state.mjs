import fs from 'node:fs'
import path from 'node:path'

const FIREBASE_CLI_CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com'
const FIREBASE_CLI_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi'

const OLD_PROJECT_ID = 'sjhr-f502d'
const NEW_PROJECT_ID = 'st-john-house-rentals'
const OLD_BUCKET = 'sjhr-f502d.firebasestorage.app'
const NEW_BUCKET = 'st-john-house-rentals.firebasestorage.app'

function getFirebaseToolsConfigPath() {
  const homeDir = process.env.USERPROFILE || process.env.HOME || ''
  const appDataDir = process.env.APPDATA || ''
  const candidates = [
    path.resolve(homeDir, '.config', 'configstore', 'firebase-tools.json'),
    path.resolve(appDataDir, 'configstore', 'firebase-tools.json'),
  ]

  return candidates.find((candidatePath) => fs.existsSync(candidatePath)) || ''
}

async function getAccessToken() {
  const configPath = getFirebaseToolsConfigPath()

  if (!configPath) {
    throw new Error('Unable to locate firebase-tools.json for Firebase CLI credentials.')
  }

  const firebaseToolsConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  const refreshToken = String(firebaseToolsConfig?.tokens?.refresh_token ?? '').trim()

  if (!refreshToken) {
    throw new Error('Firebase CLI refresh token is missing.')
  }

  const response = await fetch('https://www.googleapis.com/oauth2/v4/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: FIREBASE_CLI_CLIENT_ID,
      client_secret: FIREBASE_CLI_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  const payload = await response.json()

  if (!response.ok || !payload.access_token) {
    throw new Error(`Unable to refresh Google access token: ${JSON.stringify(payload)}`)
  }

  return payload.access_token
}

async function fetchJson(url, accessToken, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })

  const text = await response.text()
  let payload = null

  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = { raw: text }
  }

  if (!response.ok) {
    throw new Error(`${response.status} ${url} ${JSON.stringify(payload)}`)
  }

  return payload
}

async function listCollectionIds(projectId, accessToken) {
  const collectionIds = []
  let pageToken = ''

  do {
    const payload = await fetchJson(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:listCollectionIds`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({
          pageSize: 100,
          pageToken,
        }),
      },
    )

    collectionIds.push(...(payload.collectionIds || []))
    pageToken = payload.nextPageToken || ''
  } while (pageToken)

  return collectionIds.sort()
}

async function listDocuments(projectId, collectionId, accessToken) {
  const documents = []
  let pageToken = ''

  do {
    const url = new URL(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionId}`)
    url.searchParams.set('pageSize', '300')

    if (pageToken) {
      url.searchParams.set('pageToken', pageToken)
    }

    const payload = await fetchJson(url.toString(), accessToken)

    documents.push(...(payload.documents || []))
    pageToken = payload.nextPageToken || ''
  } while (pageToken)

  return documents.sort((left, right) => left.name.localeCompare(right.name))
}

function chunkArray(values, size) {
  const chunks = []

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }

  return chunks
}

async function commitWrites(projectId, writes, accessToken) {
  await fetchJson(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ writes }),
  })
}

function firestoreDocumentPath(documentName) {
  return documentName.replace(/^projects\/[^/]+\/databases\/\(default\)\/documents\//, '')
}

function encodeStorageObjectName(objectName) {
  return encodeURIComponent(objectName)
}

async function listBucketObjects(bucketName, accessToken) {
  const objects = []
  let pageToken = ''

  do {
    const url = new URL(`https://storage.googleapis.com/storage/v1/b/${bucketName}/o`)
    url.searchParams.set('maxResults', '1000')

    if (pageToken) {
      url.searchParams.set('pageToken', pageToken)
    }

    const payload = await fetchJson(url.toString(), accessToken)
    objects.push(...(payload.items || []))
    pageToken = payload.nextPageToken || ''
  } while (pageToken)

  return objects.sort((left, right) => String(left.name).localeCompare(String(right.name)))
}

async function rewriteStorageObject(sourceBucket, objectName, destinationBucket, accessToken) {
  const sourceName = encodeStorageObjectName(objectName)
  let rewriteToken = ''

  do {
    const url = new URL(
      `https://storage.googleapis.com/storage/v1/b/${sourceBucket}/o/${sourceName}/rewriteTo/b/${destinationBucket}/o/${sourceName}`,
    )

    if (rewriteToken) {
      url.searchParams.set('rewriteToken', rewriteToken)
    }

    const payload = await fetchJson(url.toString(), accessToken, {
      method: 'POST',
      body: JSON.stringify({}),
    })

    if (payload.done) {
      return payload.resource || null
    }

    rewriteToken = payload.rewriteToken || ''
  } while (rewriteToken)

  return null
}

async function deleteStorageObject(bucketName, objectName, accessToken) {
  const response = await fetch(`https://storage.googleapis.com/storage/v1/b/${bucketName}/o/${encodeStorageObjectName(objectName)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok && response.status !== 404) {
    const text = await response.text()
    throw new Error(`Failed to delete ${bucketName}/${objectName}: ${response.status} ${text}`)
  }
}

async function runWithConcurrency(values, concurrency, task) {
  const queue = [...values]
  const workers = Array.from({ length: Math.min(concurrency, queue.length || 1) }, async () => {
    while (queue.length > 0) {
      const value = queue.shift()
      await task(value)
    }
  })

  await Promise.all(workers)
}

function parseOldBucketStoragePath(value) {
  if (typeof value !== 'string') {
    return ''
  }

  if (value === OLD_BUCKET) {
    return '__bucket__'
  }

  if (value.startsWith(`gs://${OLD_BUCKET}/`)) {
    return decodeURIComponent(value.replace(`gs://${OLD_BUCKET}/`, ''))
  }

  try {
    const url = new URL(value)

    if (url.hostname === 'firebasestorage.googleapis.com') {
      const match = url.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/)

      if (match?.[1] === OLD_BUCKET) {
        return decodeURIComponent(match[2])
      }
    }

    if (url.hostname === OLD_BUCKET) {
      return url.pathname.replace(/^\/+/, '')
    }

    if (url.hostname === 'storage.googleapis.com') {
      const pathParts = url.pathname.replace(/^\/+/, '').split('/')

      if (pathParts[0] === OLD_BUCKET) {
        return pathParts.slice(1).join('/')
      }
    }
  } catch {
    return ''
  }

  return ''
}

function buildFirebaseDownloadUrl(bucketName, objectName, token) {
  const encodedObjectName = encodeURIComponent(objectName)
  const tokenSuffix = token ? `&token=${encodeURIComponent(token)}` : ''
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedObjectName}?alt=media${tokenSuffix}`
}

function buildDownloadTokenMap(bucketObjects) {
  const tokenMap = new Map()

  bucketObjects.forEach((bucketObject) => {
    const tokenValue = String(bucketObject?.metadata?.firebaseStorageDownloadTokens ?? '').trim()
    const primaryToken = tokenValue.split(',').map((value) => value.trim()).find(Boolean) || ''
    tokenMap.set(String(bucketObject.name), primaryToken)
  })

  return tokenMap
}

function rewriteFieldValue(fieldValue, tokenMap) {
  if (!fieldValue || typeof fieldValue !== 'object') {
    return fieldValue
  }

  if (Object.hasOwn(fieldValue, 'mapValue')) {
    const fields = fieldValue.mapValue?.fields || {}
    const nextFields = Object.fromEntries(
      Object.entries(fields).map(([fieldName, nestedFieldValue]) => [fieldName, rewriteFieldValue(nestedFieldValue, tokenMap)]),
    )

    return {
      ...fieldValue,
      mapValue: {
        ...fieldValue.mapValue,
        fields: nextFields,
      },
    }
  }

  if (Object.hasOwn(fieldValue, 'arrayValue')) {
    const values = Array.isArray(fieldValue.arrayValue?.values)
      ? fieldValue.arrayValue.values.map((nestedFieldValue) => rewriteFieldValue(nestedFieldValue, tokenMap))
      : []

    return {
      ...fieldValue,
      arrayValue: {
        ...fieldValue.arrayValue,
        values,
      },
    }
  }

  if (Object.hasOwn(fieldValue, 'stringValue')) {
    const rawValue = String(fieldValue.stringValue)
    const storagePath = parseOldBucketStoragePath(rawValue)

    if (storagePath === '__bucket__') {
      return {
        ...fieldValue,
        stringValue: NEW_BUCKET,
      }
    }

    if (storagePath) {
      const nextToken = tokenMap.get(storagePath) || ''

      return {
        ...fieldValue,
        stringValue: buildFirebaseDownloadUrl(NEW_BUCKET, storagePath, nextToken),
      }
    }

    return fieldValue
  }

  return fieldValue
}

function rewriteDocumentFields(document, tokenMap) {
  const rewrittenFields = Object.fromEntries(
    Object.entries(document.fields || {}).map(([fieldName, fieldValue]) => [fieldName, rewriteFieldValue(fieldValue, tokenMap)]),
  )

  return {
    name: document.name.replace(OLD_PROJECT_ID, NEW_PROJECT_ID),
    fields: rewrittenFields,
  }
}

async function syncStorage(accessToken) {
  console.log('Listing old and new bucket objects...')
  const [oldBucketObjects, newBucketObjects] = await Promise.all([
    listBucketObjects(OLD_BUCKET, accessToken),
    listBucketObjects(NEW_BUCKET, accessToken),
  ])

  const oldObjectNames = oldBucketObjects.map((bucketObject) => String(bucketObject.name))
  const newObjectNames = newBucketObjects.map((bucketObject) => String(bucketObject.name))
  const oldObjectNameSet = new Set(oldObjectNames)
  const extraObjectNames = newObjectNames.filter((objectName) => !oldObjectNameSet.has(objectName))

  console.log(`Rewriting ${oldObjectNames.length} old bucket objects into ${NEW_BUCKET}...`)
  let rewrittenCount = 0

  await runWithConcurrency(oldObjectNames, 8, async (objectName) => {
    await rewriteStorageObject(OLD_BUCKET, objectName, NEW_BUCKET, accessToken)
    rewrittenCount += 1

    if (rewrittenCount % 100 === 0 || rewrittenCount === oldObjectNames.length) {
      console.log(`Storage rewrite progress: ${rewrittenCount}/${oldObjectNames.length}`)
    }
  })

  if (extraObjectNames.length > 0) {
    console.log(`Deleting ${extraObjectNames.length} extra objects from ${NEW_BUCKET}...`)
    let deletedCount = 0

    await runWithConcurrency(extraObjectNames, 8, async (objectName) => {
      await deleteStorageObject(NEW_BUCKET, objectName, accessToken)
      deletedCount += 1

      if (deletedCount % 25 === 0 || deletedCount === extraObjectNames.length) {
        console.log(`Storage delete progress: ${deletedCount}/${extraObjectNames.length}`)
      }
    })
  }

  console.log('Reloading new bucket metadata...')
  const syncedBucketObjects = await listBucketObjects(NEW_BUCKET, accessToken)
  return buildDownloadTokenMap(syncedBucketObjects)
}

async function syncFirestore(accessToken, tokenMap) {
  console.log('Listing Firestore root collections...')
  const [oldCollectionIds, newCollectionIds] = await Promise.all([
    listCollectionIds(OLD_PROJECT_ID, accessToken),
    listCollectionIds(NEW_PROJECT_ID, accessToken),
  ])

  const collectionIdsToDelete = [...newCollectionIds]
  const collectionIdsToCreate = [...oldCollectionIds]

  console.log(`Reading ${collectionIdsToDelete.length} new collections for delete pass...`)
  const existingNewCollectionDocuments = new Map()

  for (const collectionId of collectionIdsToDelete) {
    existingNewCollectionDocuments.set(collectionId, await listDocuments(NEW_PROJECT_ID, collectionId, accessToken))
  }

  console.log(`Reading ${collectionIdsToCreate.length} old collections for copy pass...`)
  const oldCollectionDocuments = new Map()

  for (const collectionId of collectionIdsToCreate) {
    oldCollectionDocuments.set(collectionId, await listDocuments(OLD_PROJECT_ID, collectionId, accessToken))
  }

  for (const collectionId of collectionIdsToDelete) {
    const existingDocuments = existingNewCollectionDocuments.get(collectionId) || []

    if (existingDocuments.length === 0) {
      continue
    }

    console.log(`Deleting ${existingDocuments.length} docs from ${collectionId}...`)

    for (const documentChunk of chunkArray(existingDocuments, 200)) {
      await commitWrites(
        NEW_PROJECT_ID,
        documentChunk.map((document) => ({ delete: document.name })),
        accessToken,
      )
    }
  }

  for (const collectionId of collectionIdsToCreate) {
    const oldDocuments = oldCollectionDocuments.get(collectionId) || []

    if (oldDocuments.length === 0) {
      continue
    }

    console.log(`Writing ${oldDocuments.length} docs to ${collectionId}...`)

    for (const documentChunk of chunkArray(oldDocuments, 100)) {
      await commitWrites(
        NEW_PROJECT_ID,
        documentChunk.map((document) => ({
          update: rewriteDocumentFields(document, tokenMap),
        })),
        accessToken,
      )
    }
  }
}

async function main() {
  console.log(`Syncing ${OLD_PROJECT_ID} into ${NEW_PROJECT_ID}...`)
  const accessToken = await getAccessToken()
  const tokenMap = await syncStorage(accessToken)
  await syncFirestore(accessToken, tokenMap)
  console.log('Firebase project sync complete.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error)
  process.exitCode = 1
})
