import { useEffect, useMemo, useState } from 'react'
import { getAdminIdToken } from '../lib/adminAuth'
import {
  archiveAdminClient,
  getAdminPropertyAnalytics,
  listAdminClients,
  saveAdminClient,
} from '../lib/adminClientApi'
import { listAllProperties, setAdminPropertyClientId } from '../lib/propertyRepository'

const BLANK_DRAFT = {
  businessName: '',
  contactName: '',
  email: '',
  phone: '',
  subscriptionStartAt: '',
  subscriptionEndAt: '',
  address: '',
  notes: '',
}

const EMPTY_ANALYTICS_STATE = {
  state: 'idle',
  message: '',
  report: null,
}

function draftFromClient(client) {
  return {
    businessName: client?.businessName ?? '',
    contactName: client?.contactName ?? '',
    email: client?.email ?? '',
    phone: client?.phone ?? '',
    subscriptionStartAt: client?.subscriptionStartAt ?? '',
    subscriptionEndAt: client?.subscriptionEndAt ?? '',
    address: client?.address ?? '',
    notes: client?.notes ?? '',
  }
}

function isClientDraftChanged(draft, client) {
  const currentDraft = draftFromClient(draft)
  const savedDraft = client ? draftFromClient(client) : BLANK_DRAFT

  return Object.keys(BLANK_DRAFT).some((field) => String(currentDraft[field] ?? '') !== String(savedDraft[field] ?? ''))
}

function comparePropertyNames(left, right) {
  return String(left?.name ?? '').localeCompare(String(right?.name ?? ''), undefined, { sensitivity: 'base' })
}

function getClientDisplayName(client) {
  const businessName = String(client?.businessName ?? '').trim()
  const contactName = String(client?.contactName ?? '').trim()
  const email = String(client?.email ?? '').trim()

  return businessName || contactName || email || 'Unnamed client'
}

function getTodayDateOnly() {
  const now = new Date()
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60 * 1000)
  return localDate.toISOString().slice(0, 10)
}

function normalizeDateOnlyValue(value) {
  const normalized = String(value ?? '').trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : ''
}

function isPropertyRenewalDue(property, todayDateOnly) {
  const renewalDueAt = normalizeDateOnlyValue(property?.renewalDueAt)
  return Boolean(renewalDueAt && renewalDueAt <= todayDateOnly)
}

function formatMetricNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(number) : '0'
}

function formatPercent(value) {
  const number = Number(value)
  return Number.isFinite(number) ? `${Math.round(number * 100)}%` : '0%'
}

function formatDuration(secondsValue) {
  const seconds = Number(secondsValue)

  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '0s'
  }

  const roundedSeconds = Math.round(seconds)
  const minutes = Math.floor(roundedSeconds / 60)
  const secondsRemainder = roundedSeconds % 60

  return minutes > 0 ? `${minutes}m ${secondsRemainder}s` : `${secondsRemainder}s`
}

function formatGaDate(value) {
  const source = String(value ?? '').trim()

  if (/^\d{8}$/.test(source)) {
    return `${source.slice(4, 6)}/${source.slice(6, 8)}/${source.slice(0, 4)}`
  }

  return source
}

function getAnalyticsMessage(report) {
  if (!report) {
    return ''
  }

  if (report.status === 'unconfigured') {
    return report.message || 'Google Analytics reporting is not configured for the admin API.'
  }

  if (report.status === 'unavailable') {
    return report.message || 'Google Analytics data is temporarily unavailable.'
  }

  return ''
}

function PropertyAnalyticsPanel({ analyticsState, property }) {
  const report = analyticsState.report
  const message = analyticsState.state === 'error' ? analyticsState.message : getAnalyticsMessage(report)
  const metrics = report?.metrics ?? {}
  const dailyRows = Array.isArray(report?.daily) ? report.daily.slice(0, 7) : []
  const sourceRows = Array.isArray(report?.sources) ? report.sources.slice(0, 5) : []

  return (
    <section className="admin-client-analytics" aria-label={property?.name ? `${property.name} analytics` : 'Property analytics'} aria-live="polite">
      {property?.slug ? (
        <div className="admin-client-section-actions">
          <a className="button-link button-link--ghost admin-action" href={`/admin?tab=properties&propertySlug=${encodeURIComponent(property.slug)}`}>
            Edit property
          </a>
        </div>
      ) : null}

      {property?.path ? <p className="admin-client-path">{property.path}</p> : null}

      {analyticsState.state === 'loading' ? <p className="admin-empty">Loading analytics...</p> : null}
      {message && analyticsState.state !== 'loading' ? <p className="admin-note">{message}</p> : null}

      {analyticsState.state === 'ready' && report?.status === 'ready' ? (
        <>
          <div className="admin-client-metric-grid">
            <div className="admin-client-metric">
              <span>Views</span>
              <strong>{formatMetricNumber(metrics.views)}</strong>
            </div>
            <div className="admin-client-metric">
              <span>Users</span>
              <strong>{formatMetricNumber(metrics.activeUsers)}</strong>
            </div>
            <div className="admin-client-metric">
              <span>Sessions</span>
              <strong>{formatMetricNumber(metrics.sessions)}</strong>
            </div>
            <div className="admin-client-metric">
              <span>Engagement</span>
              <strong>{formatPercent(metrics.engagementRate)}</strong>
            </div>
            <div className="admin-client-metric">
              <span>Avg. session</span>
              <strong>{formatDuration(metrics.averageSessionDuration)}</strong>
            </div>
          </div>

          <div className="admin-client-analytics-tables">
            <div className="admin-client-table-shell">
              <span className="eyebrow">Daily Views</span>
              {dailyRows.length > 0 ? (
                <table className="admin-client-analytics-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Views</th>
                      <th>Users</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyRows.map((row) => (
                      <tr key={row.date}>
                        <td>{formatGaDate(row.date)}</td>
                        <td>{formatMetricNumber(row.views)}</td>
                        <td>{formatMetricNumber(row.activeUsers)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p>No recent page views for this property.</p>
              )}
            </div>

            <div className="admin-client-table-shell">
              <span className="eyebrow">Traffic Sources</span>
              {sourceRows.length > 0 ? (
                <table className="admin-client-analytics-table">
                  <thead>
                    <tr>
                      <th>Source</th>
                      <th>Sessions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sourceRows.map((row) => (
                      <tr key={row.sourceMedium}>
                        <td>{row.sourceMedium || '(not set)'}</td>
                        <td>{formatMetricNumber(row.sessions)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p>No recent source data for this property.</p>
              )}
            </div>
          </div>
        </>
      ) : null}
    </section>
  )
}

function UnassignedPropertyRow({ property, clients, disabled, onAssign }) {
  const [selectedClientId, setSelectedClientId] = useState('')

  return (
    <div className="admin-inline-actions admin-client-unassigned-row">
      <span className="admin-client-unassigned-name">{property.name || property.slug}</span>
      <select
        aria-label={`Assign ${property.name || property.slug} to a client`}
        disabled={disabled}
        value={selectedClientId}
        onChange={(event) => setSelectedClientId(event.target.value)}
      >
        <option value="">Assign to client...</option>
        {clients.map((client) => (
          <option key={client.id} value={client.id}>
            {getClientDisplayName(client)}
          </option>
        ))}
      </select>
      <button
        className="button-link button-link--ghost admin-action"
        disabled={disabled || !selectedClientId}
        type="button"
        onClick={() => {
          onAssign(property.adminOriginalSlug || property.slug, selectedClientId)
          setSelectedClientId('')
        }}
      >
        Assign
      </button>
    </div>
  )
}

function UnassignedPropertiesPanel({ properties, clients, assignStatus, onAssign }) {
  const isSaving = assignStatus.state === 'saving'

  return (
    <section className="admin-client-unassigned-panel" aria-label={`Properties without a client (${properties.length})`}>
      <div className="admin-inline-actions admin-client-unassigned-header">
        <strong>Properties without a client</strong>
        <span className="admin-chip">{properties.length}</span>
      </div>

      {assignStatus.message ? (
        <p className={`admin-feedback admin-feedback--${assignStatus.state === 'success' ? 'idle' : assignStatus.state}`}>
          {assignStatus.message}
        </p>
      ) : null}

      {properties.length > 0 ? (
        <div className="admin-client-unassigned-list">
          {properties.map((property) => (
            <UnassignedPropertyRow key={property.slug} clients={clients} disabled={isSaving} property={property} onAssign={onAssign} />
          ))}
        </div>
      ) : (
        <p className="admin-empty">Every property is linked to a client.</p>
      )}
    </section>
  )
}

export function AdminClientsPanel({ authUser }) {
  const [workspaceState, setWorkspaceState] = useState({ status: 'loading', clients: [], message: '' })
  const [properties, setProperties] = useState([])
  const [selectedClientId, setSelectedClientId] = useState('')
  const [selectedPropertySlug, setSelectedPropertySlug] = useState('')
  const [propertyAnalyticsState, setPropertyAnalyticsState] = useState(EMPTY_ANALYTICS_STATE)
  const [draft, setDraft] = useState(BLANK_DRAFT)
  const [formStatus, setFormStatus] = useState({ state: 'idle', message: '' })
  const [archiveStatus, setArchiveStatus] = useState({ state: 'idle', message: '' })
  const [assignStatus, setAssignStatus] = useState({ state: 'idle', message: '' })
  const [addPropertySlug, setAddPropertySlug] = useState('')

  async function loadProperties(authToken) {
    try {
      setProperties(await listAllProperties({ authToken }))
    } catch {
      setProperties([])
    }
  }

  async function handleAssignProperty(propertySlug, clientId) {
    setAssignStatus({ state: 'saving', message: '' })

    try {
      const authToken = await getAdminIdToken()

      if (!authToken) {
        throw new Error('Sign in to assign properties.')
      }

      await setAdminPropertyClientId(propertySlug, clientId, { authToken })
      setAssignStatus({ state: 'success', message: clientId ? 'Property assigned.' : 'Property unlinked.' })
      await loadProperties(authToken)
    } catch (error) {
      setAssignStatus({
        state: 'error',
        message: error instanceof Error ? error.message : "Unable to update this property's client.",
      })
    }
  }

  async function loadClients({ selectId } = {}) {
    setWorkspaceState((current) => ({ ...current, status: 'loading', message: '' }))

    try {
      const authToken = await getAdminIdToken()

      if (!authToken) {
        throw new Error('Sign in to view clients.')
      }

      const clients = await listAdminClients({ authToken })
      setWorkspaceState({ status: 'ready', clients, message: '' })
      await loadProperties(authToken)

      const nextId = selectId !== undefined ? selectId : selectedClientId
      const nextSelected = clients.find((client) => client.id === nextId) ?? clients[0] ?? null
      setSelectedClientId(nextSelected?.id ?? '')
      setDraft(nextSelected ? draftFromClient(nextSelected) : BLANK_DRAFT)
    } catch (error) {
      setWorkspaceState((current) => ({
        status: 'error',
        clients: current.clients,
        message: error instanceof Error ? error.message : 'Unable to load clients.',
      }))
    }
  }

  useEffect(() => {
    if (!authUser?.uid) {
      setWorkspaceState({ status: 'error', clients: [], message: 'Sign in to view clients.' })
      setProperties([])
      setSelectedClientId('')
      setSelectedPropertySlug('')
      setPropertyAnalyticsState(EMPTY_ANALYTICS_STATE)
      setDraft(BLANK_DRAFT)
      setArchiveStatus({ state: 'idle', message: '' })
      return
    }

    loadClients({ selectId: '' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?.uid])

  const clients = workspaceState.clients ?? []
  const selectedClient = clients.find((client) => client.id === selectedClientId) ?? null
  const isCreatingNew = !selectedClientId
  const hasDraftChanges = isClientDraftChanged(draft, selectedClient)
  const shouldShowSaveButton = hasDraftChanges || formStatus.state === 'saving'
  const todayDateOnly = getTodayDateOnly()
  const renewalCountByClientId = useMemo(() => {
    const counts = new Map()

    for (const property of properties) {
      const clientId = String(property?.clientId ?? '').trim()

      if (!clientId || !isPropertyRenewalDue(property, todayDateOnly)) {
        continue
      }

      counts.set(clientId, (counts.get(clientId) ?? 0) + 1)
    }

    return counts
  }, [properties, todayDateOnly])
  const linkedProperties = useMemo(
    () =>
      selectedClient
        ? properties
            .filter((property) => String(property?.clientId ?? '').trim() === selectedClient.id)
            .sort(comparePropertyNames)
        : [],
    [properties, selectedClient],
  )
  const unassignedProperties = useMemo(
    () => properties.filter((property) => !String(property?.clientId ?? '').trim()).sort(comparePropertyNames),
    [properties],
  )
  const linkedPropertySlugs = linkedProperties.map((property) => property.slug).join('|')
  const selectedProperty = linkedProperties.find((property) => property.slug === selectedPropertySlug) ?? null
  const selectedClientRenewalCount = selectedClient ? renewalCountByClientId.get(selectedClient.id) ?? 0 : 0

  useEffect(() => {
    setSelectedPropertySlug((currentSlug) => {
      if (!selectedClient || linkedProperties.length === 0) {
        return ''
      }

      return linkedProperties.some((property) => property.slug === currentSlug) ? currentSlug : linkedProperties[0].slug
    })
  }, [linkedProperties, linkedPropertySlugs, selectedClient])

  useEffect(() => {
    setAddPropertySlug('')
  }, [selectedClientId])

  useEffect(() => {
    if (!authUser?.uid || !selectedProperty?.slug) {
      setPropertyAnalyticsState(EMPTY_ANALYTICS_STATE)
      return undefined
    }

    let cancelled = false

    async function loadPropertyAnalytics() {
      setPropertyAnalyticsState({ state: 'loading', message: '', report: null })

      try {
        const authToken = await getAdminIdToken()

        if (!authToken) {
          throw new Error('Sign in to view analytics.')
        }

        const report = await getAdminPropertyAnalytics(selectedProperty.slug, { authToken })

        if (!cancelled) {
          setPropertyAnalyticsState({ state: 'ready', message: '', report })
        }
      } catch (error) {
        if (!cancelled) {
          setPropertyAnalyticsState({
            state: 'error',
            message: error instanceof Error ? error.message : 'Unable to load property analytics.',
            report: null,
          })
        }
      }
    }

    loadPropertyAnalytics()

    return () => {
      cancelled = true
    }
  }, [authUser?.uid, selectedProperty?.slug])

  function handleSelectClient(client) {
    setSelectedClientId(client.id)
    setDraft(draftFromClient(client))
    setFormStatus({ state: 'idle', message: '' })
    setArchiveStatus({ state: 'idle', message: '' })
  }

  function handleStartNewClient() {
    setSelectedClientId('')
    setSelectedPropertySlug('')
    setPropertyAnalyticsState(EMPTY_ANALYTICS_STATE)
    setDraft(BLANK_DRAFT)
    setFormStatus({ state: 'idle', message: '' })
    setArchiveStatus({ state: 'idle', message: '' })
  }

  function handleFieldChange(field, value) {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  async function handleSave(event) {
    event.preventDefault()
    setFormStatus({ state: 'saving', message: '' })

    try {
      const authToken = await getAdminIdToken()

      if (!authToken) {
        throw new Error('Sign in to save this client.')
      }

      const savedClient = await saveAdminClient(draft, selectedClientId, {
        authToken,
        expectedUpdatedAt: selectedClient?.updatedAt ?? null,
      })

      setFormStatus({ state: 'success', message: 'Client saved.' })
      await loadClients({ selectId: savedClient?.id ?? '' })
    } catch (error) {
      setFormStatus({
        state: 'error',
        message: error instanceof Error ? error.message : 'Unable to save this client.',
      })
    }
  }

  async function handleArchive() {
    if (!selectedClientId) {
      return
    }

    if (!window.confirm(`Archive ${getClientDisplayName(selectedClient)}? The client will be removed from the active client list.`)) {
      return
    }

    setArchiveStatus({ state: 'saving', message: '' })

    try {
      const authToken = await getAdminIdToken()

      if (!authToken) {
        throw new Error('Sign in to archive this client.')
      }

      await archiveAdminClient(selectedClientId, { authToken })
      setArchiveStatus({ state: 'idle', message: '' })
      await loadClients({ selectId: '' })
    } catch (error) {
      setArchiveStatus({
        state: 'error',
        message: error instanceof Error ? error.message : 'Unable to archive this client.',
      })
    }
  }

  return (
    <section className="admin-panel admin-panel--clients" aria-label="Clients">
      <div className="admin-panel-header admin-client-panel-header">
        <div className="admin-inline-actions admin-client-toolbar">
          {clients.length > 0 ? (
            <div className="admin-client-selector">
              <label className="visually-hidden" htmlFor="admin-client-select">
                Select client
              </label>
              <select
                id="admin-client-select"
                value={selectedClientId}
                onChange={(event) => {
                  const nextClientId = event.target.value
                  const nextClient = clients.find((client) => client.id === nextClientId)

                  if (nextClient) {
                    handleSelectClient(nextClient)
                  }
                }}
              >
                <option value="" disabled>
                  New client
                </option>
                {clients.map((client) => {
                  const renewalCount = renewalCountByClientId.get(client.id) ?? 0
                  const renewalLabel = renewalCount > 0 ? ` (${renewalCount} due)` : ''

                  return (
                    <option key={client.id} value={client.id}>
                      {`${getClientDisplayName(client)}${renewalLabel}`}
                    </option>
                  )
                })}
              </select>
              {selectedClientRenewalCount > 0 ? (
                <span className="admin-client-renewal-badge">{`${selectedClientRenewalCount} due`}</span>
              ) : null}
            </div>
          ) : null}
          <span className="admin-chip">{`${clients.length} client${clients.length === 1 ? '' : 's'}`}</span>
          <button className="button-link button-link--primary admin-action" type="button" onClick={handleStartNewClient}>
            New client
          </button>
        </div>
      </div>

      {workspaceState.message ? <p className="admin-empty">{workspaceState.message}</p> : null}
      {workspaceState.status === 'loading' && clients.length === 0 ? <p className="admin-empty">Loading clients...</p> : null}
      {workspaceState.status === 'ready' && clients.length === 0 ? (
        <p className="admin-empty">No clients yet. Use "New client" to add the first one.</p>
      ) : null}

      {unassignedProperties.length > 0 || assignStatus.message ? (
        <UnassignedPropertiesPanel
          assignStatus={assignStatus}
          clients={clients}
          properties={unassignedProperties}
          onAssign={handleAssignProperty}
        />
      ) : null}

      <div className="admin-client-layout">
        <div className="admin-inquiry-detail admin-client-detail-shell">
          {!isCreatingNew ? (
            <div className="admin-inline-actions admin-client-detail-actions">
              <button
                className="button-link button-link--ghost admin-action"
                disabled={archiveStatus.state === 'saving'}
                type="button"
                onClick={handleArchive}
              >
                {archiveStatus.state === 'saving' ? 'Archiving...' : 'Archive client'}
              </button>
            </div>
          ) : null}

          {archiveStatus.message ? (
            <p className={`admin-feedback admin-feedback--${archiveStatus.state === 'success' ? 'idle' : archiveStatus.state}`}>
              {archiveStatus.message}
            </p>
          ) : null}

          <form className="admin-form-grid admin-client-detail-form" onSubmit={handleSave}>
            <label className="admin-field">
              <span>Contact name</span>
              <input
                type="text"
                value={draft.contactName}
                onChange={(event) => handleFieldChange('contactName', event.target.value)}
                required
              />
            </label>
            <label className="admin-field">
              <span>Business name</span>
              <input
                type="text"
                value={draft.businessName}
                onChange={(event) => handleFieldChange('businessName', event.target.value)}
              />
            </label>
            <label className="admin-field">
              <span>Email</span>
              <input type="email" value={draft.email} onChange={(event) => handleFieldChange('email', event.target.value)} />
            </label>
            <label className="admin-field">
              <span>Phone</span>
              <input type="tel" value={draft.phone} onChange={(event) => handleFieldChange('phone', event.target.value)} />
            </label>
            <label className="admin-field">
              <span>Subscription start</span>
              <input
                type="date"
                value={draft.subscriptionStartAt}
                onChange={(event) => handleFieldChange('subscriptionStartAt', event.target.value)}
              />
            </label>
            <label className="admin-field">
              <span>Subscription end</span>
              <input
                type="date"
                value={draft.subscriptionEndAt}
                onChange={(event) => handleFieldChange('subscriptionEndAt', event.target.value)}
              />
            </label>
            <label className="admin-field admin-field--full-width">
              <span>Address</span>
              <input type="text" value={draft.address} onChange={(event) => handleFieldChange('address', event.target.value)} />
            </label>
            <label className="admin-field admin-field--full-width">
              <span>Notes</span>
              <textarea rows={4} value={draft.notes} onChange={(event) => handleFieldChange('notes', event.target.value)} />
            </label>

            {formStatus.message ? (
              <p className={`admin-feedback admin-feedback--${formStatus.state === 'success' ? 'idle' : formStatus.state}`}>
                {formStatus.message}
              </p>
            ) : null}

            {shouldShowSaveButton ? (
              <div className="admin-inline-actions">
                <button className="button-link button-link--primary admin-action" type="submit" disabled={formStatus.state === 'saving'}>
                  {formStatus.state === 'saving' ? 'Saving...' : isCreatingNew ? 'Create client' : 'Save changes'}
                </button>
              </div>
            ) : null}
          </form>

          {!isCreatingNew ? (
            <div className="admin-client-related-grid">
              <section className="admin-client-detail-properties" aria-label={`Listed properties (${linkedProperties.length})`}>
                <div className="admin-inline-actions admin-client-add-property-row">
                  <select
                    aria-label="Add a property to this client"
                    disabled={assignStatus.state === 'saving' || unassignedProperties.length === 0}
                    value={addPropertySlug}
                    onChange={(event) => setAddPropertySlug(event.target.value)}
                  >
                    <option value="">
                      {unassignedProperties.length > 0 ? 'Select property...' : 'No unassigned properties'}
                    </option>
                    {unassignedProperties.map((property) => (
                      <option key={property.slug} value={property.adminOriginalSlug || property.slug}>
                        {property.name || property.slug}
                      </option>
                    ))}
                  </select>
                  {addPropertySlug ? (
                    <button
                      className="button-link button-link--ghost admin-action"
                      disabled={assignStatus.state === 'saving'}
                      type="button"
                      onClick={() => {
                        handleAssignProperty(addPropertySlug, selectedClient.id)
                        setAddPropertySlug('')
                      }}
                    >
                      Add
                    </button>
                  ) : null}
                </div>

                {linkedProperties.length > 0 ? (
                  <div className="admin-inquiry-list admin-client-property-list">
                    {linkedProperties.map((property) => (
                      <button
                        className={`admin-inquiry-button admin-client-property-button ${
                          selectedPropertySlug === property.slug ? 'admin-inquiry-button--active' : ''
                        }`.trim()}
                        key={property.slug}
                        type="button"
                        onClick={() => setSelectedPropertySlug(property.slug)}
                      >
                        <div className="admin-inquiry-button-header">
                          <strong>{property.name}</strong>
                          {isPropertyRenewalDue(property, todayDateOnly) ? <span className="admin-client-renewal-badge">Renewal due</span> : null}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p>No properties linked to this client yet.</p>
                )}
              </section>

              <PropertyAnalyticsPanel analyticsState={propertyAnalyticsState} property={selectedProperty} />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
