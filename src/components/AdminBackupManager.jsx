import { useCallback, useEffect, useState } from 'react'
import {
  deployAdminStagingPreview,
  fetchAdminBackupOperationsStatus,
  fetchAdminBackupStatus,
  startAdminManagedBackup,
  startAdminStagingClone,
  switchAdminPublicSiteTarget,
} from '../lib/adminBackupApi'

const BACKUP_JOB_STORAGE_KEY = 'genericcms.admin.backup-jobs'
const BACKUP_ROUTE_MISSING_MESSAGE = 'Route not found in siteApi'

function normalizeString(value) {
  return String(value ?? '').trim()
}

function createJsonClone(value) {
  return value === undefined ? null : JSON.parse(JSON.stringify(value))
}

function readStoredBackupJobs() {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const rawValue = window.localStorage.getItem(BACKUP_JOB_STORAGE_KEY)

    if (!rawValue) {
      return []
    }

    const parsedValue = JSON.parse(rawValue)
    return Array.isArray(parsedValue) ? parsedValue : []
  } catch {
    return []
  }
}

function persistStoredBackupJobs(jobs) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(BACKUP_JOB_STORAGE_KEY, JSON.stringify(Array.isArray(jobs) ? jobs.slice(0, 12) : []))
  } catch {
    // Ignore local storage failures.
  }
}

function normalizeBackupJob(job = {}) {
  const releaseName = normalizeString(job.releaseName)
  const versionName = normalizeString(job.versionName)

  return {
    id: normalizeString(job.id || job.operationName || releaseName || versionName) || `${normalizeString(job.type)}-${normalizeString(job.snapshotTime)}` || 'backup-job',
    type: normalizeString(job.type),
    status: normalizeString(job.status) || 'running',
    requestedAt: normalizeString(job.requestedAt),
    requestedBy: normalizeString(job.requestedBy),
    snapshotTime: normalizeString(job.snapshotTime),
    sourceDatabase: normalizeString(job.sourceDatabase),
    destinationDatabase: normalizeString(job.destinationDatabase),
    outputUriPrefix: normalizeString(job.outputUriPrefix),
    collectionIds: Array.isArray(job.collectionIds) ? job.collectionIds.map((entry) => normalizeString(entry)).filter(Boolean) : [],
    operationName: normalizeString(job.operationName),
    operation: job.operation ? createJsonClone(job.operation) : null,
    operationLookupError: normalizeString(job.operationLookupError),
    previousPublicTargetVariant: normalizeString(job.previousPublicTargetVariant),
    publicTargetVariant: normalizeString(job.publicTargetVariant),
    releaseName,
    releaseTime: normalizeString(job.releaseTime),
    siteUrl: normalizeString(job.siteUrl),
    versionName,
  }
}

function mergeStoredJobsWithOperationUpdates(storedJobs = [], operationUpdates = []) {
  const updatesByName = new Map(
    (Array.isArray(operationUpdates) ? operationUpdates : [])
      .map((operation) => ({
        operationName: normalizeString(operation?.operationName),
        operation: operation?.operation ? createJsonClone(operation.operation) : null,
        operationLookupError: normalizeString(operation?.operationLookupError),
        status: normalizeString(operation?.status),
      }))
      .filter((operation) => operation.operationName)
      .map((operation) => [operation.operationName, operation]),
  )

  return storedJobs
    .map((job) => {
      const normalizedJob = normalizeBackupJob(job)
      const operationUpdate = updatesByName.get(normalizedJob.operationName)

      if (!operationUpdate) {
        return normalizedJob
      }

      return normalizeBackupJob({
        ...normalizedJob,
        operation: operationUpdate.operation,
        operationLookupError: operationUpdate.operationLookupError,
        status: operationUpdate.status || normalizedJob.status,
      })
    })
    .slice(0, 12)
}

function appendStoredBackupJob(job) {
  const nextJobs = [normalizeBackupJob(job), ...readStoredBackupJobs().filter((entry) => normalizeString(entry?.operationName) !== normalizeString(job?.operationName))]
  persistStoredBackupJobs(nextJobs)
  return nextJobs
}

function formatBackupApiError(error, fallbackMessage) {
  const message = normalizeString(error?.message)

  if (message === BACKUP_ROUTE_MISSING_MESSAGE) {
    return 'Backup tools are not available on this deployed API yet. Deploy the latest functions to enable the Backups tab.'
  }

  return message || fallbackMessage
}

function formatDateTime(value) {
  const normalizedValue = normalizeString(value)

  if (!normalizedValue) {
    return '—'
  }

  const date = new Date(normalizedValue)

  if (Number.isNaN(date.getTime())) {
    return normalizedValue
  }

  return date.toLocaleString()
}

function formatDatabaseSummary(database = {}) {
  if (!database?.configured) {
    return 'Not configured'
  }

  if (!database?.exists) {
    return database?.message || 'Database not found'
  }

  const parts = [database.locationId, database.state].filter(Boolean)
  return parts.length > 0 ? parts.join(' | ') : 'Configured'
}

function formatDatabaseRecovery(database = {}) {
  if (!database?.configured) {
    return '—'
  }

  if (!database?.exists) {
    return database?.message || 'Database not found'
  }

  if (!database.pointInTimeRecoveryEnablement) {
    return 'Unknown'
  }

  return database.pointInTimeRecoveryEnablement === 'POINT_IN_TIME_RECOVERY_ENABLED' ? 'Enabled' : 'Disabled'
}

function getJobTone(job = {}) {
  switch (job.status) {
    case 'failed':
      return 'error'
    case 'running':
      return 'saving'
    case 'completed':
      return 'idle'
    default:
      return 'warning'
  }
}

function formatPublicTargetLabel(variant) {
  switch (normalizeString(variant)) {
    case 'live':
      return 'Original live database'
    case 'staging':
      return 'Staging clone database'
    default:
      return 'Unknown target'
  }
}

function formatChannelSummary(channel = {}) {
  if (!channel?.exists) {
    return channel?.message || 'Not deployed'
  }

  const targetLabel = formatPublicTargetLabel(channel?.release?.version?.apiTarget?.variant)
  const updatedAt = formatDateTime(channel?.release?.releaseTime || channel?.updateTime)

  return updatedAt !== '—' ? `${targetLabel} | ${updatedAt}` : targetLabel
}

function formatJobHeading(job = {}) {
  if (job.type === 'public-cutover') {
    return normalizeString(job.publicTargetVariant) === 'staging' ? 'Switch public site to staging' : 'Return public site to live DB'
  }

  if (job.type === 'staging-preview-deploy') {
    return 'Refresh staging preview'
  }

  return job.type === 'staging-clone' ? 'Clone live DB to staging' : 'Managed export backup'
}

function formatJobSummary(job = {}) {
  const operationError = job.operation?.error?.message || job.operationLookupError

  if (operationError) {
    return operationError
  }

  if (job.type === 'public-cutover') {
    const fromTarget = formatPublicTargetLabel(job.previousPublicTargetVariant)
    const toTarget = formatPublicTargetLabel(job.publicTargetVariant)
    const summary = [fromTarget, toTarget].filter(Boolean).join(' → ')

    return summary || 'Public site target updated'
  }

  if (job.type === 'staging-preview-deploy') {
    return job.siteUrl || 'Staging preview refreshed'
  }

  if (job.type === 'staging-clone') {
    return [job.sourceDatabase, job.destinationDatabase].filter(Boolean).join(' → ') || 'Clone requested'
  }

  return job.outputUriPrefix || 'Managed export requested'
}

function SummaryCard({ eyebrow = '', title, summary, rows = [] }) {
  return (
    <article className="admin-summary-card">
      {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
      <div>
        <h3>{title}</h3>
        <p>{summary}</p>
      </div>

      {rows.length > 0 ? (
        <dl className="admin-backup-meta">
          {rows.map((row) => (
            <div key={`${title}-${row.label}`}>
              <dt>{row.label}</dt>
              <dd>{row.value || '—'}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </article>
  )
}

export function AdminBackupManager({ authUser = null }) {
  const [workspace, setWorkspace] = useState(null)
  const [workspaceState, setWorkspaceState] = useState('loading')
  const [backupJobs, setBackupJobs] = useState(() => readStoredBackupJobs().map((job) => normalizeBackupJob(job)))
  const [feedback, setFeedback] = useState('')
  const [feedbackTone, setFeedbackTone] = useState('idle')
  const [actionState, setActionState] = useState('idle')
  const [exportForm, setExportForm] = useState({
    collectionIds: '',
    outputUriPrefix: '',
    snapshotTime: '',
  })
  const [cloneForm, setCloneForm] = useState({
    databaseId: '',
    snapshotTime: '',
  })

  const refreshStoredBackupJobs = useCallback(async () => {
    const storedJobs = readStoredBackupJobs().map((job) => normalizeBackupJob(job))

    if (storedJobs.length === 0) {
      setBackupJobs([])
      return
    }

    const operationNames = storedJobs.map((job) => job.operationName).filter(Boolean)

    if (operationNames.length === 0) {
      setBackupJobs(storedJobs)
      persistStoredBackupJobs(storedJobs)
      return
    }

    try {
      const response = await fetchAdminBackupOperationsStatus(operationNames)
      const mergedJobs = mergeStoredJobsWithOperationUpdates(storedJobs, response?.operations)
      setBackupJobs(mergedJobs)
      persistStoredBackupJobs(mergedJobs)
    } catch (error) {
      setBackupJobs(storedJobs)
      setFeedback(formatBackupApiError(error, 'Unable to refresh backup operation status.'))
      setFeedbackTone('warning')
    }
  }, [])

  const loadWorkspace = useCallback(async () => {
    if (!authUser) {
      setWorkspace(null)
      setWorkspaceState('idle')
      setBackupJobs([])
      return
    }

    setWorkspaceState('loading')

    try {
      const response = await fetchAdminBackupStatus()
      setWorkspace(response ?? null)
      setWorkspaceState('ready')
      await refreshStoredBackupJobs()
    } catch (error) {
      setWorkspaceState('error')
      setFeedback(formatBackupApiError(error, 'Unable to load the backup workspace.'))
      setFeedbackTone('error')
    }
  }, [authUser, refreshStoredBackupJobs])

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void loadWorkspace()
    }, 0)

    return () => clearTimeout(timeoutId)
  }, [loadWorkspace])

  async function handleManagedBackupSubmit(event) {
    event.preventDefault()
    setActionState('exporting')
    setFeedback('')

    try {
      const response = await startAdminManagedBackup(exportForm)
      const job = normalizeBackupJob(response?.job ?? {})
      appendStoredBackupJob(job)
      setFeedback(
        job.outputUriPrefix
          ? `Managed export started for ${job.sourceDatabase || 'the live database'} to ${job.outputUriPrefix}.`
          : 'Managed export started.',
      )
      setFeedbackTone('idle')
      await loadWorkspace()
    } catch (error) {
      setFeedback(formatBackupApiError(error, 'Unable to start the managed export.'))
      setFeedbackTone('error')
    } finally {
      setActionState('idle')
    }
  }

  async function handleCloneSubmit(event) {
    event.preventDefault()
    setActionState('cloning')
    setFeedback('')

    try {
      const response = await startAdminStagingClone(cloneForm)
      const job = normalizeBackupJob(response?.job ?? {})
      appendStoredBackupJob(job)
      setFeedback(
        job.destinationDatabase
          ? `Staging clone started from ${job.sourceDatabase || 'the live database'} to ${job.destinationDatabase}.`
          : 'Staging clone started.',
      )
      setFeedbackTone('idle')
      await loadWorkspace()
    } catch (error) {
      setFeedback(formatBackupApiError(error, 'Unable to start the staging clone.'))
      setFeedbackTone('error')
    } finally {
      setActionState('idle')
    }
  }

  async function handleStagingPreviewDeploy() {
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(
        'This will refresh the staging preview channel using the currently deployed live Hosting release and route only /api to siteApiStaging. It will not build unpublished local source code. Continue?',
      )

      if (!confirmed) {
        return
      }
    }

    setActionState('deploying-staging-preview')
    setFeedback('')

    try {
      const response = await deployAdminStagingPreview()
      const job = normalizeBackupJob(response?.job ?? {})
      appendStoredBackupJob(job)
      setFeedback(
        job.siteUrl
          ? `The staging preview was refreshed: ${job.siteUrl}`
          : 'The staging preview was refreshed.',
      )
      setFeedbackTone('idle')
      await loadWorkspace()
    } catch (error) {
      setFeedback(formatBackupApiError(error, 'Unable to refresh the staging preview.'))
      setFeedbackTone('error')
    } finally {
      setActionState('idle')
    }
  }

  async function handlePublicCutover(targetVariant) {
    const normalizedTarget = normalizeString(targetVariant).toLowerCase()
    const targetLabel = formatPublicTargetLabel(normalizedTarget).toLowerCase()

    if (typeof window !== 'undefined') {
      const confirmationMessage =
        normalizedTarget === 'staging'
          ? 'This will switch the public live site to the staged clone by changing only the Hosting /api rewrite. The original live database stays untouched. Continue?'
          : 'This will switch the public live site back to the original live database. Continue?'

      if (!window.confirm(confirmationMessage)) {
        return
      }
    }

    setActionState('cutting-over')
    setFeedback('')

    try {
      const response = await switchAdminPublicSiteTarget({ target: normalizedTarget })
      const job = normalizeBackupJob(response?.job ?? {})
      appendStoredBackupJob(job)
      setFeedback(
        response?.unchanged
          ? `The public site is already serving the ${targetLabel}.`
          : `The public site now serves the ${targetLabel}. The original live database was not modified.`,
      )
      setFeedbackTone('idle')
      await loadWorkspace()
    } catch (error) {
      setFeedback(formatBackupApiError(error, 'Unable to switch the public site target.'))
      setFeedbackTone('error')
    } finally {
      setActionState('idle')
    }
  }

  const liveDatabase = workspace?.liveDatabase ?? null
  const stagingDatabase = workspace?.stagingDatabase ?? null
  const hosting = workspace?.hosting ?? null
  const liveChannel = hosting?.liveChannel ?? null
  const stagingChannel = hosting?.stagingChannel ?? null
  const publicTrafficTarget = normalizeString(hosting?.publicTrafficTarget || liveChannel?.release?.version?.apiTarget?.variant)
  const actionsDisabled = actionState !== 'idle' || workspace?.backupActionsEnabled === false
  const canDeployStagingPreview = actionsDisabled || stagingDatabase?.exists !== true
  const canSwitchToStaging = actionsDisabled || stagingDatabase?.exists !== true || publicTrafficTarget === 'staging'
  const canSwitchToLive = actionsDisabled || publicTrafficTarget === 'live'

  return (
    <div className="admin-editor">
      <div className="admin-panel-header">
        <div>
          <h2>Backup & Staging</h2>
        </div>
        <div className="admin-inline-actions">
          <button className="button-link button-link--ghost admin-action" type="button" onClick={loadWorkspace} disabled={actionState !== 'idle'}>
            Refresh
          </button>
        </div>
      </div>

      {feedback ? <p className={`admin-feedback admin-feedback--${feedbackTone}`}>{feedback}</p> : null}

      {workspace?.apiVariant === 'staging' ? (
        <p className="admin-note">Backup actions are disabled on the staging preview. Use the live admin workspace to create exports or staging clones.</p>
      ) : null}

      <p className="admin-note">This tab only exposes safe operations. It can create managed exports, clone the live database to staging, and switch public `/api` traffic between the live and staging API. It will not restore over the live database.</p>

      {workspaceState === 'loading' ? <p className="admin-empty">Loading backup workspace...</p> : null}
      {workspaceState === 'error' ? <p className="admin-empty">Backup workspace unavailable.</p> : null}

      {workspaceState === 'ready' && workspace ? (
        <>
          <div className="admin-summary-grid">
            <SummaryCard
              eyebrow="Live"
              title={liveDatabase?.databaseId || 'Live database'}
              summary={formatDatabaseSummary(liveDatabase)}
              rows={[
                { label: 'PITR', value: formatDatabaseRecovery(liveDatabase) },
                { label: 'Earliest recoverable time', value: formatDateTime(liveDatabase?.earliestVersionTime) },
              ]}
            />

            <SummaryCard
              eyebrow="Staging"
              title={stagingDatabase?.databaseId || 'Staging database'}
              summary={formatDatabaseSummary(stagingDatabase)}
              rows={[
                { label: 'PITR', value: formatDatabaseRecovery(stagingDatabase) },
                { label: 'Earliest recoverable time', value: formatDateTime(stagingDatabase?.earliestVersionTime) },
              ]}
            />

            <SummaryCard
              eyebrow="Project"
              title={workspace.projectId || 'Unknown project'}
              summary={workspace.backupOutputUri || 'No backup output URI configured'}
              rows={[
                { label: 'API variant', value: workspace.apiVariant || 'live' },
                { label: 'Backup output', value: workspace.backupOutputUri || 'Set FIRESTORE_BACKUP_OUTPUT_URI' },
              ]}
            />

            <SummaryCard
              eyebrow="Public site"
              title={formatPublicTargetLabel(publicTrafficTarget)}
              summary={formatChannelSummary(liveChannel)}
              rows={[
                { label: 'Live URL', value: liveChannel?.url || liveChannel?.message || 'Unavailable' },
                { label: 'Preview URL', value: stagingChannel?.url || stagingChannel?.message || 'Not deployed' },
              ]}
            />
          </div>

          <div className="admin-backup-grid">
            <section className="admin-page-card">
              <div>
                <h3>Create managed backup</h3>
                <p>Exports the live Firestore database to Cloud Storage at a PITR-aligned snapshot minute.</p>
              </div>

              <form className="admin-form admin-form--flush" onSubmit={handleManagedBackupSubmit}>
                <div className="admin-content-grid">
                  <label className="admin-field">
                    <span>Snapshot time</span>
                    <input
                      disabled={actionsDisabled}
                      type="datetime-local"
                      value={exportForm.snapshotTime}
                      onChange={(event) => setExportForm((current) => ({ ...current, snapshotTime: event.target.value }))}
                    />
                  </label>

                  <label className="admin-field">
                    <span>Output URI override</span>
                    <input
                      disabled={actionsDisabled}
                      placeholder={workspace.backupOutputUri || 'gs://bucket/path'}
                      type="text"
                      value={exportForm.outputUriPrefix}
                      onChange={(event) => setExportForm((current) => ({ ...current, outputUriPrefix: event.target.value }))}
                    />
                  </label>

                  <label className="admin-field admin-field--wide">
                    <span>Collection IDs</span>
                    <input
                      disabled={actionsDisabled}
                      placeholder="Optional comma-separated collection ids"
                      type="text"
                      value={exportForm.collectionIds}
                      onChange={(event) => setExportForm((current) => ({ ...current, collectionIds: event.target.value }))}
                    />
                  </label>
                </div>

                <div className="admin-inline-actions">
                  <button className="button-link button-link--primary admin-submit" disabled={actionsDisabled} type="submit">
                    {actionState === 'exporting' ? 'Starting backup...' : 'Create managed backup'}
                  </button>
                </div>
              </form>
            </section>

            <section className="admin-page-card">
              <div>
                <h3>Clone live DB to staging</h3>
                <p>Creates a staging database clone from a PITR snapshot without changing what the public live site serves.</p>
              </div>

              <form className="admin-form admin-form--flush" onSubmit={handleCloneSubmit}>
                <div className="admin-content-grid">
                  <label className="admin-field">
                    <span>Snapshot time</span>
                    <input
                      disabled={actionsDisabled}
                      type="datetime-local"
                      value={cloneForm.snapshotTime}
                      onChange={(event) => setCloneForm((current) => ({ ...current, snapshotTime: event.target.value }))}
                    />
                  </label>

                  <label className="admin-field">
                    <span>Staging database id</span>
                    <input
                      disabled={actionsDisabled}
                      placeholder={stagingDatabase?.databaseId || 'Uses FIRESTORE_STAGING_DATABASE_ID'}
                      type="text"
                      value={cloneForm.databaseId}
                      onChange={(event) => setCloneForm((current) => ({ ...current, databaseId: event.target.value }))}
                    />
                  </label>
                </div>

                <div className="admin-inline-actions">
                  <button className="button-link button-link--primary admin-submit" disabled={actionsDisabled} type="submit">
                    {actionState === 'cloning' ? 'Starting clone...' : 'Clone live DB to staging'}
                  </button>
                </div>
              </form>
            </section>

            <section className="admin-page-card">
              <div>
                <h3>Deploy staging preview</h3>
                <p>Refreshes the `staging` preview channel from the current deployed live Hosting release and rewrites only `/api` to `siteApiStaging`.</p>
              </div>

              <dl className="admin-backup-meta">
                <div>
                  <dt>Preview URL</dt>
                  <dd>{stagingChannel?.url || stagingChannel?.message || 'Not deployed'}</dd>
                </div>
                <div>
                  <dt>Channel</dt>
                  <dd>{stagingChannel?.channelId || 'staging'}</dd>
                </div>
              </dl>

              <div className="admin-inline-actions">
                <button
                  className="button-link button-link--primary admin-submit"
                  disabled={canDeployStagingPreview}
                  type="button"
                  onClick={handleStagingPreviewDeploy}
                >
                  {actionState === 'deploying-staging-preview' ? 'Refreshing preview...' : 'Refresh staging preview'}
                </button>
              </div>

              <p className="admin-note">This is the Backups-tab version of the staging preview deploy. It updates the deployed preview channel but does not build unpublished local repo changes.</p>

              {stagingDatabase?.exists !== true ? (
                <p className="admin-note">Clone the live database to staging before refreshing the staging preview.</p>
              ) : null}
            </section>

            <section className="admin-page-card">
              <div>
                <h3>Switch public site traffic</h3>
                <p>This changes only the live Hosting `/api` rewrite. It does not overwrite, import into, or delete either Firestore database.</p>
              </div>

              <dl className="admin-backup-meta">
                <div>
                  <dt>Current live target</dt>
                  <dd>{formatPublicTargetLabel(publicTrafficTarget)}</dd>
                </div>
                <div>
                  <dt>Live URL</dt>
                  <dd>{liveChannel?.url || liveChannel?.message || 'Unavailable'}</dd>
                </div>
                <div>
                  <dt>Staging preview</dt>
                  <dd>{stagingChannel?.url || stagingChannel?.message || 'Deploy the staging preview first if you want a browser URL to validate.'}</dd>
                </div>
              </dl>

              <div className="admin-inline-actions">
                <button
                  className="button-link button-link--primary admin-submit"
                  disabled={canSwitchToStaging}
                  type="button"
                  onClick={() => handlePublicCutover('staging')}
                >
                  {actionState === 'cutting-over' && publicTrafficTarget !== 'staging' ? 'Switching...' : 'Make staging live'}
                </button>

                <button
                  className="button-link button-link--ghost admin-action"
                  disabled={canSwitchToLive}
                  type="button"
                  onClick={() => handlePublicCutover('live')}
                >
                  {actionState === 'cutting-over' && publicTrafficTarget !== 'live' ? 'Switching...' : 'Return to original live DB'}
                </button>
              </div>

              {stagingDatabase?.exists !== true ? (
                <p className="admin-note">Clone the live database to staging before switching public traffic to the staging API.</p>
              ) : null}
            </section>
          </div>

          <section className="admin-backup-jobs">
            <div className="admin-content-section-header">
              <div>
                <h4>Recent backup jobs</h4>
                <p>These are the backup, clone, and public cutover actions started from this browser.</p>
              </div>
            </div>

            <div className="admin-backup-job-list">
              {backupJobs.length > 0 ? (
                backupJobs.map((job) => (
                  <article className="admin-page-card" key={job.id}>
                    <div className="admin-page-card-top">
                      <span className={`admin-route-tag admin-route-tag--${getJobTone(job)}`.trim()}>{job.status || 'running'}</span>
                      {job.operation?.done === true ? <span className="admin-route-group">Operation complete</span> : null}
                    </div>

                    <div>
                      <h3>{formatJobHeading(job)}</h3>
                      <p>{formatJobSummary(job)}</p>
                    </div>

                    <dl className="admin-backup-meta">
                      <div>
                        <dt>Requested</dt>
                        <dd>{formatDateTime(job.requestedAt)}</dd>
                      </div>
                      <div>
                        <dt>Requested by</dt>
                        <dd>{job.requestedBy || '—'}</dd>
                      </div>
                      <div>
                        <dt>Snapshot time</dt>
                        <dd>{formatDateTime(job.snapshotTime)}</dd>
                      </div>
                      <div>
                        <dt>Operation</dt>
                        <dd>{job.operationName || '—'}</dd>
                      </div>
                      {job.releaseName ? (
                        <div>
                          <dt>Release</dt>
                          <dd>{job.releaseName}</dd>
                        </div>
                      ) : null}
                    </dl>
                  </article>
                ))
              ) : (
                <p className="admin-empty">No backup jobs have been started from this browser yet.</p>
              )}
            </div>
          </section>
        </>
      ) : null}
    </div>
  )
}
