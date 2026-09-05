import { useEffect, useMemo, useRef, useState } from 'react'
import { getAdminIdToken } from '../lib/adminAuth'
import {
  createAdminSocialPost,
  getAdminPropertySocialSummary,
  getAdminSocialConnectionStatus,
  refreshAdminSocialPostMetrics,
} from '../lib/adminSocialApi'
import { listAllProperties } from '../lib/propertyRepository'
import { buildRemoteImageUrl } from '../lib/remoteImage'

const PLATFORM_LABELS = { facebook: 'Facebook', instagram: 'Instagram' }
const ENGAGEMENT_METRIC_LABELS = [
  ['siteLikes', 'Site Likes'],
  ['facebookLikes', 'Facebook Likes'],
  ['facebookShareClicks', 'Facebook Shares'],
  ['pinterestShareClicks', 'Pinterest Shares'],
  ['twitterShareClicks', 'X Shares'],
  ['whatsappShareClicks', 'WhatsApp Shares'],
  ['emailShareClicks', 'Email Shares'],
  ['nativeShareClicks', 'Other Shares'],
]
const BLANK_COMPOSE_DRAFT = { message: '', imageUrl: '', platforms: { facebook: false, instagram: false } }

function comparePropertyNames(left, right) {
  return String(left?.name ?? '').localeCompare(String(right?.name ?? ''), undefined, { sensitivity: 'base' })
}

function getPropertyGalleryImages(property) {
  const gallery = Array.isArray(property?.gallery) ? property.gallery.filter((image) => image?.url) : []

  if (gallery.length > 0) {
    return gallery
  }

  return property?.heroImage?.url ? [property.heroImage] : []
}

function formatDateTime(value) {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString()
}

function formatNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(number) : '0'
}

function PlatformResultChip({ result, onRefreshMetrics, refreshing }) {
  const label = PLATFORM_LABELS[result.platform] || result.platform

  if (result.status === 'not_connected') {
    return (
      <div className="admin-social-post-chip admin-social-post-chip--not-connected">
        <strong>{label}</strong>
        <span>Not connected</span>
      </div>
    )
  }

  if (result.status === 'failed') {
    return (
      <div className="admin-social-post-chip admin-social-post-chip--failed">
        <strong>{label}</strong>
        <span>{result.message || 'Publishing failed.'}</span>
      </div>
    )
  }

  return (
    <div className="admin-social-post-chip admin-social-post-chip--published">
      <strong>{label}</strong>
      {result.metrics ? (
        <span>
          {formatNumber(result.metrics.likes)} likes &middot; {formatNumber(result.metrics.comments)} comments
          {typeof result.metrics.shares === 'number' ? ` · ${formatNumber(result.metrics.shares)} shares` : ''}
        </span>
      ) : (
        <span>Published</span>
      )}
      <button className="button-link button-link--ghost admin-social-refresh-metrics" disabled={refreshing} onClick={onRefreshMetrics} type="button">
        {refreshing ? 'Refreshing...' : 'Refresh metrics'}
      </button>
    </div>
  )
}

function SocialPostCard({ post, onRefreshMetrics, refreshingPostId }) {
  return (
    <li className="admin-social-post-card">
      {post.imageUrl ? <img alt="" className="admin-social-post-thumbnail" src={post.imageUrl} /> : null}
      <div className="admin-social-post-body">
        <p className="admin-social-post-message">{post.message}</p>
        <p className="admin-social-post-meta">
          {formatDateTime(post.createdAt)} {post.createdBy ? `by ${post.createdBy}` : ''}
        </p>
        <div className="admin-social-post-chips">
          {post.platformResults.map((result) => (
            <PlatformResultChip
              key={result.platform}
              onRefreshMetrics={() => onRefreshMetrics(post.id)}
              refreshing={refreshingPostId === post.id}
              result={result}
            />
          ))}
        </div>
      </div>
    </li>
  )
}

export function AdminSocialMediaPanel({ authUser }) {
  const [propertiesState, setPropertiesState] = useState({ status: 'loading', properties: [], message: '' })
  const [selectedPropertySlug, setSelectedPropertySlug] = useState('')
  const [connectionStatus, setConnectionStatus] = useState(null)
  const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' })
  const [summaryState, setSummaryState] = useState({ status: 'idle', summary: null, message: '' })
  const [composeDraft, setComposeDraft] = useState(BLANK_COMPOSE_DRAFT)
  const [composeStatus, setComposeStatus] = useState({ state: 'idle', message: '' })
  const [metricsStatus, setMetricsStatus] = useState({ state: 'idle', message: '' })
  const [refreshingPostId, setRefreshingPostId] = useState('')
  const summaryRequestIdRef = useRef(0)

  const selectedProperty = useMemo(
    () => propertiesState.properties.find((property) => property.slug === selectedPropertySlug) ?? null,
    [propertiesState.properties, selectedPropertySlug],
  )
  const galleryImages = useMemo(() => getPropertyGalleryImages(selectedProperty), [selectedProperty])

  async function loadSummary(slug, range) {
    const requestId = summaryRequestIdRef.current + 1
    summaryRequestIdRef.current = requestId

    setSummaryState((current) => ({ ...current, status: 'loading', message: '' }))

    try {
      const authToken = await getAdminIdToken()

      if (!authToken) {
        throw new Error('Sign in to view social activity.')
      }

      const summary = await getAdminPropertySocialSummary(slug, { ...range, authToken })

      if (summaryRequestIdRef.current !== requestId) {
        return null
      }

      setSummaryState({ status: 'ready', summary, message: '' })
      return summary
    } catch (error) {
      if (summaryRequestIdRef.current === requestId) {
        setSummaryState({ status: 'error', summary: null, message: error instanceof Error ? error.message : 'Unable to load social activity.' })
      }

      return null
    }
  }

  useEffect(
    () => () => {
      summaryRequestIdRef.current += 1
    },
    [],
  )

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!authUser?.uid) {
        setPropertiesState({ status: 'error', properties: [], message: 'Sign in to manage social media.' })
        return
      }

      try {
        const authToken = await getAdminIdToken()

        if (!authToken) {
          throw new Error('Sign in to manage social media.')
        }

        const [properties, status] = await Promise.all([
          listAllProperties({ authToken }),
          getAdminSocialConnectionStatus({ authToken }),
        ])

        if (cancelled) {
          return
        }

        const sortedProperties = [...properties].sort(comparePropertyNames)
        setPropertiesState({ status: 'ready', properties: sortedProperties, message: '' })
        setConnectionStatus(status)
        setSelectedPropertySlug((current) => current || sortedProperties[0]?.slug || '')
      } catch (error) {
        if (!cancelled) {
          setPropertiesState({ status: 'error', properties: [], message: error instanceof Error ? error.message : 'Unable to load properties.' })
        }
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [authUser?.uid])

  useEffect(() => {
    if (!selectedPropertySlug) {
      return
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSummary(selectedPropertySlug, dateRange)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPropertySlug])

  function handlePropertyChange(slug) {
    setSelectedPropertySlug(slug)
    setComposeDraft(BLANK_COMPOSE_DRAFT)
    setComposeStatus({ state: 'idle', message: '' })
    setMetricsStatus({ state: 'idle', message: '' })
  }

  function handleDateRangeApply() {
    if (selectedPropertySlug) {
      loadSummary(selectedPropertySlug, dateRange)
    }
  }

  function handleImageSelect(image) {
    const url = image ? buildRemoteImageUrl(image, { width: 1600, height: 1200, mode: 'fit' }) : ''
    setComposeDraft((current) => ({ ...current, imageUrl: url }))
  }

  function handlePlatformToggle(platform) {
    setComposeDraft((current) => ({
      ...current,
      platforms: { ...current.platforms, [platform]: !current.platforms[platform] },
    }))
  }

  async function handleComposeSubmit(event) {
    event.preventDefault()

    const selectedPlatforms = Object.entries(composeDraft.platforms)
      .filter(([, selected]) => selected)
      .map(([platform]) => platform)

    if (!composeDraft.message.trim()) {
      setComposeStatus({ state: 'error', message: 'Write a caption before publishing.' })
      return
    }

    if (selectedPlatforms.length === 0) {
      setComposeStatus({ state: 'error', message: 'Select at least one platform.' })
      return
    }

    if (selectedPlatforms.includes('instagram') && !composeDraft.imageUrl) {
      setComposeStatus({ state: 'error', message: 'Instagram posts require an image - pick one from the gallery below.' })
      return
    }

    setComposeStatus({ state: 'saving', message: '' })

    try {
      const authToken = await getAdminIdToken()

      if (!authToken) {
        throw new Error('Sign in to publish social posts.')
      }

      const post = await createAdminSocialPost(
        {
          propertySlug: selectedProperty?.slug ?? selectedPropertySlug,
          message: composeDraft.message,
          imageUrl: composeDraft.imageUrl,
          platforms: selectedPlatforms,
        },
        { authToken },
      )

      const failedPlatforms = (post?.platformResults ?? []).filter((result) => result.status !== 'published')

      setComposeStatus({
        state: failedPlatforms.length > 0 ? 'error' : 'success',
        message:
          failedPlatforms.length > 0
            ? failedPlatforms.map((result) => `${PLATFORM_LABELS[result.platform] || result.platform}: ${result.message}`).join(' ')
            : 'Post published.',
      })
      setComposeDraft(BLANK_COMPOSE_DRAFT)
      await loadSummary(selectedPropertySlug, dateRange)
    } catch (error) {
      setComposeStatus({ state: 'error', message: error instanceof Error ? error.message : 'Unable to publish this post.' })
    }
  }

  async function handleRefreshMetrics(postId) {
    setRefreshingPostId(postId)
    setMetricsStatus({ state: 'saving', message: '' })

    try {
      const authToken = await getAdminIdToken()

      if (!authToken) {
        throw new Error('Sign in to refresh metrics.')
      }

      await refreshAdminSocialPostMetrics(postId, { authToken })
      const updatedSummary = await loadSummary(selectedPropertySlug, dateRange)

      if (updatedSummary) {
        setMetricsStatus({ state: 'success', message: 'Metrics refreshed.' })
      }
    } catch (error) {
      setMetricsStatus({ state: 'error', message: error instanceof Error ? error.message : 'Unable to refresh metrics.' })
    } finally {
      setRefreshingPostId('')
    }
  }

  const engagementCounts = summaryState.summary?.visitorEngagement?.counts ?? null
  const engagementDateRange = summaryState.summary?.visitorEngagement?.dateRange ?? null
  const posts = summaryState.summary?.posts ?? []

  return (
    <section className="admin-panel admin-panel--social">
      <div className="admin-panel-header">
        <h2>Social Media</h2>
        <label className="admin-field admin-social-property-select">
          <span>Property</span>
          <select
            disabled={propertiesState.status !== 'ready'}
            value={selectedPropertySlug}
            onChange={(event) => handlePropertyChange(event.target.value)}
          >
            {propertiesState.properties.map((property) => (
              <option key={property.slug} value={property.slug}>
                {property.name || property.slug}
              </option>
            ))}
          </select>
        </label>
      </div>

      {propertiesState.status === 'error' ? <p className="admin-feedback admin-feedback--error">{propertiesState.message}</p> : null}

      {connectionStatus && (!connectionStatus.facebookConfigured || !connectionStatus.instagramConfigured) ? (
        <p className="admin-feedback admin-feedback--warning">
          {!connectionStatus.facebookConfigured ? 'Facebook is not connected. ' : ''}
          {!connectionStatus.instagramConfigured ? 'Instagram is not connected. ' : ''}
          Set {connectionStatus.missingEnvVars.join(', ')} in Firebase config/secrets and redeploy to enable publishing.
        </p>
      ) : null}

      <div className="admin-editor admin-social-engagement">
        <div className="admin-editor-header">
          <h3>Site Engagement</h3>
          <div className="admin-social-date-range">
            <input
              aria-label="Start date"
              type="date"
              value={dateRange.startDate}
              onChange={(event) => setDateRange((current) => ({ ...current, startDate: event.target.value }))}
            />
            <span>to</span>
            <input
              aria-label="End date"
              type="date"
              value={dateRange.endDate}
              onChange={(event) => setDateRange((current) => ({ ...current, endDate: event.target.value }))}
            />
            <button className="button-link button-link--ghost" onClick={handleDateRangeApply} type="button">
              Apply
            </button>
          </div>
        </div>

        {summaryState.status === 'loading' ? <p>Loading...</p> : null}
        {summaryState.status === 'error' ? <p className="admin-feedback admin-feedback--error">{summaryState.message}</p> : null}

        {summaryState.status === 'ready' && engagementCounts ? (
          <>
            {engagementDateRange?.startDate && engagementDateRange?.endDate ? (
              <p className="admin-social-engagement-range">
                {engagementDateRange.startDate} to {engagementDateRange.endDate}
                {summaryState.summary?.visitorEngagement?.clamped ? ` (tracking began ${summaryState.summary.visitorEngagement.trackingStartDate})` : ''}
              </p>
            ) : null}
            <dl className="admin-client-invoice-metrics admin-social-engagement-metrics">
              {ENGAGEMENT_METRIC_LABELS.map(([key, label]) => (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd>{formatNumber(engagementCounts[key])}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : null}
      </div>

      <form className="admin-editor admin-social-compose" onSubmit={handleComposeSubmit}>
        <div className="admin-editor-header">
          <h3>New Post</h3>
        </div>

        <label className="admin-field admin-field--full-width">
          <span>Caption</span>
          <textarea
            placeholder="Write a caption for this property..."
            rows={4}
            value={composeDraft.message}
            onChange={(event) => setComposeDraft((current) => ({ ...current, message: event.target.value }))}
          />
        </label>

        {galleryImages.length > 0 ? (
          <div className="admin-field admin-field--full-width">
            <span>Image (required for Instagram)</span>
            <div className="admin-social-image-picker">
              <button
                className={`admin-social-image-option admin-social-image-option--none ${!composeDraft.imageUrl ? 'admin-social-image-option--selected' : ''}`}
                onClick={() => handleImageSelect(null)}
                type="button"
              >
                No image
              </button>
              {galleryImages.map((image, index) => {
                const previewUrl = buildRemoteImageUrl(image, { width: 240, height: 240, mode: 'fit' })
                const fullUrl = buildRemoteImageUrl(image, { width: 1600, height: 1200, mode: 'fit' })
                const isSelected = composeDraft.imageUrl === fullUrl

                return (
                  <button
                    className={`admin-social-image-option ${isSelected ? 'admin-social-image-option--selected' : ''}`}
                    key={`${image.url}-${index}`}
                    onClick={() => handleImageSelect(image)}
                    type="button"
                  >
                    <img alt={image.alt || ''} src={previewUrl} />
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}

        <div className="admin-field admin-field--full-width admin-social-platforms">
          <span>Platforms</span>
          <label className={connectionStatus && !connectionStatus.facebookConfigured ? 'admin-social-platform-disabled' : ''}>
            <input
              checked={composeDraft.platforms.facebook}
              disabled={connectionStatus ? !connectionStatus.facebookConfigured : true}
              type="checkbox"
              onChange={() => handlePlatformToggle('facebook')}
            />
            Facebook {connectionStatus && !connectionStatus.facebookConfigured ? '(not connected)' : ''}
          </label>
          <label className={connectionStatus && !connectionStatus.instagramConfigured ? 'admin-social-platform-disabled' : ''}>
            <input
              checked={composeDraft.platforms.instagram}
              disabled={connectionStatus ? !connectionStatus.instagramConfigured : true}
              type="checkbox"
              onChange={() => handlePlatformToggle('instagram')}
            />
            Instagram {connectionStatus && !connectionStatus.instagramConfigured ? '(not connected)' : ''}
          </label>
        </div>

        {composeStatus.message ? (
          <p className={`admin-feedback admin-feedback--${composeStatus.state === 'success' ? 'idle' : composeStatus.state}`}>
            {composeStatus.message}
          </p>
        ) : null}

        <button className="button-link button-link--primary" disabled={composeStatus.state === 'saving'} type="submit">
          {composeStatus.state === 'saving' ? 'Publishing...' : 'Publish'}
        </button>
      </form>

      <div className="admin-editor admin-social-post-history">
        <div className="admin-editor-header">
          <h3>Posts</h3>
        </div>

        {metricsStatus.message ? (
          <p className={`admin-feedback admin-feedback--${metricsStatus.state === 'success' ? 'idle' : metricsStatus.state}`}>
            {metricsStatus.message}
          </p>
        ) : null}

        {posts.length === 0 ? (
          <p className="admin-social-empty">No posts yet for this property.</p>
        ) : (
          <ul className="admin-social-post-list">
            {posts.map((post) => (
              <SocialPostCard key={post.id} onRefreshMetrics={handleRefreshMetrics} post={post} refreshingPostId={refreshingPostId} />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
