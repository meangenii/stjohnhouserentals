const { onRequest } = require('firebase-functions/v2/https')
const { getPropertyBySlug, listBedroomGroups } = require('./propertyRepository')

const startedAt = new Date().toISOString()

const publicSiteConfig = {
  siteName: 'St. John House Rentals',
  phase: 'snapshot-driven public-site rebuild',
  stack: ['react', 'firebase-hosting', 'cloud-functions'],
  snapshotDate: '2026-05-08',
  routes: [
    '/',
    '/about-us',
    '/st-john-rentals',
    '/for-rent',
    '/property-for-sale',
    '/car-barge-information',
    '/passenger-ferry',
    '/cars',
    '/boats',
    '/map',
    '/advertise',
    '/privacy-policy',
    '/terms-of-agreement',
    '/rental-properties/:slug',
  ],
}

exports.siteApi = onRequest({ region: 'us-central1', cors: true }, (request, response) => {
  const path = request.path.replace(/^\/+/, '')

  if (request.method === 'GET' && (path === '' || path === 'health')) {
    response.json({
      service: 'siteApi',
      status: 'ok',
      phase: publicSiteConfig.phase,
      startedAt,
      checkedAt: new Date().toISOString(),
    })
    return
  }

  if (request.method === 'GET' && path === 'site-config') {
    response.json({
      ...publicSiteConfig,
      checkedAt: new Date().toISOString(),
    })
    return
  }

  if (request.method === 'GET' && path === 'properties') {
    response.json({
      source: 'mock',
      checkedAt: new Date().toISOString(),
      groups: listBedroomGroups(),
    })
    return
  }

  if (request.method === 'GET' && path.startsWith('properties/')) {
    const slug = path.replace(/^properties\//, '')
    const property = getPropertyBySlug(slug)

    if (!property) {
      response.status(404).json({
        error: 'not-found',
        message: 'Property not found in siteApi',
        slug,
      })
      return
    }

    response.json(property)
    return
  }

  response.status(404).json({
    error: 'not-found',
    message: 'Route not found in siteApi',
    path: request.path,
  })
})
