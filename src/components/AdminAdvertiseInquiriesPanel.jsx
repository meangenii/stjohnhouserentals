import { useEffect, useState } from 'react'
import { getAdminIdToken } from '../lib/adminAuth'
import { listAdminAdvertiseInquiries } from '../lib/adminAdvertiseInquiryApi'

function formatInquiryName(inquiry) {
  const parts = [String(inquiry?.firstName ?? '').trim(), String(inquiry?.lastName ?? '').trim()].filter(Boolean)
  return parts.join(' ') || 'Unknown sender'
}

function formatInquiryDate(value) {
  const candidate = String(value ?? '').trim()

  if (!candidate) {
    return 'Date unavailable'
  }

  const date = new Date(candidate)

  if (Number.isNaN(date.getTime())) {
    return 'Date unavailable'
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function formatDeliveryLabel(inquiry) {
  if (inquiry?.status === 'emailed' || inquiry?.delivery?.status === 'sent') {
    return 'Emailed'
  }

  if (inquiry?.delivery?.status === 'failed') {
    return 'Email failed'
  }

  if (inquiry?.delivery?.status === 'not-configured') {
    return 'Stored only'
  }

  if (inquiry?.delivery?.status === 'missing-recipient') {
    return 'Missing recipient'
  }

  return inquiry?.status === 'received' ? 'Received' : 'Unknown'
}

function getDeliveryTone(inquiry) {
  if (inquiry?.status === 'emailed' || inquiry?.delivery?.status === 'sent') {
    return 'success'
  }

  if (inquiry?.delivery?.status === 'failed' || inquiry?.delivery?.status === 'missing-recipient') {
    return 'error'
  }

  return 'muted'
}

function summarizeInquiry(inquiry) {
  const subject = String(inquiry?.subject ?? '').trim()
  return subject || 'No subject'
}

function formatInquirySource(inquiry) {
  const pageTitle = String(inquiry?.pageTitle ?? '').trim()

  if (pageTitle) {
    return pageTitle
  }

  const type = String(inquiry?.type ?? '').trim()

  return type === 'advertise' ? 'Advertise page' : 'Website'
}

function getMetadataLine(inquiry) {
  const parts = [inquiry?.metadata?.host, inquiry?.metadata?.origin].filter(Boolean)
  return parts.join(' | ')
}

export function AdminAdvertiseInquiriesPanel({ authUser }) {
  const [workspaceState, setWorkspaceState] = useState({
    status: 'loading',
    inquiries: [],
    message: '',
  })
  const [activeInquiryId, setActiveInquiryId] = useState('')

  useEffect(() => {
    if (!authUser?.uid) {
      setWorkspaceState({ status: 'error', inquiries: [], message: 'Sign in to view form submissions.' })
      setActiveInquiryId('')
      return undefined
    }

    let cancelled = false

    async function loadInquiries() {
      setWorkspaceState((current) => ({
        ...current,
        status: 'loading',
        message: '',
      }))

      try {
        const authToken = await getAdminIdToken()

        if (!authToken) {
          throw new Error('Sign in to view form submissions.')
        }

        const inquiries = await listAdminAdvertiseInquiries({ authToken })

        if (cancelled) {
          return
        }

        setWorkspaceState({
          status: 'ready',
          inquiries,
          message: '',
        })
        setActiveInquiryId((currentId) => (inquiries.some((inquiry) => inquiry.id === currentId) ? currentId : inquiries[0]?.id ?? ''))
      } catch (error) {
        if (cancelled) {
          return
        }

        setWorkspaceState((current) => ({
          status: 'error',
          inquiries: current.inquiries,
          message: error instanceof Error ? error.message : 'Unable to load form submissions.',
        }))
      }
    }

    loadInquiries()

    return () => {
      cancelled = true
    }
  }, [authUser?.uid])

  async function handleRefresh() {
    setWorkspaceState((current) => ({
      ...current,
      status: 'loading',
      message: '',
    }))

    try {
      const authToken = await getAdminIdToken()

      if (!authToken) {
        throw new Error('Sign in to view form submissions.')
      }

      const inquiries = await listAdminAdvertiseInquiries({ authToken })
      setWorkspaceState({
        status: 'ready',
        inquiries,
        message: '',
      })
      setActiveInquiryId((currentId) => (inquiries.some((inquiry) => inquiry.id === currentId) ? currentId : inquiries[0]?.id ?? ''))
    } catch (error) {
      setWorkspaceState((current) => ({
        status: 'error',
        inquiries: current.inquiries,
        message: error instanceof Error ? error.message : 'Unable to load form submissions.',
      }))
    }
  }

  const inquiries = workspaceState.inquiries ?? []
  const selectedInquiry = inquiries.find((inquiry) => inquiry.id === activeInquiryId) ?? inquiries[0] ?? null
  const isRefreshing = workspaceState.status === 'loading' && inquiries.length > 0

  return (
    <section className="admin-panel">
      <div className="admin-panel-header">
        <div>
          <h2>Submission Inbox</h2>
        </div>
        <div className="admin-inline-actions">
          <span className="admin-chip">{`${inquiries.length} submission${inquiries.length === 1 ? '' : 's'}`}</span>
          <button className="button-link button-link--ghost admin-action" type="button" onClick={handleRefresh}>
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {workspaceState.message ? <p className="admin-empty">{workspaceState.message}</p> : null}
      {workspaceState.status === 'loading' && inquiries.length === 0 ? <p className="admin-empty">Loading form submissions...</p> : null}
      {workspaceState.status === 'ready' && inquiries.length === 0 ? (
        <p className="admin-empty">No form submissions have been saved yet.</p>
      ) : null}

      {inquiries.length > 0 ? (
        <div className="admin-inquiry-layout">
          <div className="admin-inquiry-list">
            {inquiries.map((inquiry) => (
              <button
                key={inquiry.id}
                className={`admin-inquiry-button ${selectedInquiry?.id === inquiry.id ? 'admin-inquiry-button--active' : ''}`.trim()}
                type="button"
                onClick={() => setActiveInquiryId(inquiry.id)}
              >
                <div className="admin-inquiry-button-header">
                  <strong>{formatInquiryName(inquiry)}</strong>
                  <span className={`admin-status-pill admin-status-pill--${getDeliveryTone(inquiry)}`}>{formatDeliveryLabel(inquiry)}</span>
                </div>
                <span>{inquiry.email || 'No email provided'}</span>
                <span>{summarizeInquiry(inquiry)}</span>
                <span className="admin-inquiry-source">{formatInquirySource(inquiry)}</span>
                <time dateTime={inquiry.createdAt || undefined}>{formatInquiryDate(inquiry.createdAt)}</time>
              </button>
            ))}
          </div>

          {selectedInquiry ? (
            <div className="admin-inquiry-detail">
              <div className="admin-panel-header">
                <div>
                  <div className="eyebrow">Submission Detail</div>
                  <h3>{formatInquiryName(selectedInquiry)}</h3>
                </div>
                <span className={`admin-status-pill admin-status-pill--${getDeliveryTone(selectedInquiry)}`}>
                  {formatDeliveryLabel(selectedInquiry)}
                </span>
              </div>

              <div className="admin-inquiry-meta-grid">
                <div className="admin-field">
                  <span className="eyebrow">Received</span>
                  <p>{formatInquiryDate(selectedInquiry.createdAt)}</p>
                </div>
                <div className="admin-field">
                  <span className="eyebrow">Sender Email</span>
                  <p>
                    {selectedInquiry.email ? <a href={`mailto:${selectedInquiry.email}`}>{selectedInquiry.email}</a> : 'No email provided'}
                  </p>
                </div>
                <div className="admin-field">
                  <span className="eyebrow">Subject</span>
                  <p>{selectedInquiry.subject || 'No subject'}</p>
                </div>
                <div className="admin-field">
                  <span className="eyebrow">Source</span>
                  <p>{formatInquirySource(selectedInquiry)}</p>
                </div>
                <div className="admin-field">
                  <span className="eyebrow">Recipient</span>
                  <p>{selectedInquiry.delivery?.recipientEmail || 'No recipient recorded'}</p>
                </div>
              </div>

              <div className="admin-field">
                <span className="eyebrow">Message</span>
                <div className="admin-inquiry-message">
                  <p>{selectedInquiry.message || 'No message was submitted.'}</p>
                </div>
              </div>

              <div className="admin-inquiry-meta-grid">
                <div className="admin-field">
                  <span className="eyebrow">Request Source</span>
                  <p>{getMetadataLine(selectedInquiry) || 'No request source recorded'}</p>
                </div>
                <div className="admin-field">
                  <span className="eyebrow">IP Address</span>
                  <p>{selectedInquiry.metadata?.ip || 'Not recorded'}</p>
                </div>
                <div className="admin-field admin-field--full-width">
                  <span className="eyebrow">User Agent</span>
                  <p>{selectedInquiry.metadata?.userAgent || 'Not recorded'}</p>
                </div>
                {selectedInquiry.delivery?.message ? (
                  <div className="admin-field admin-field--full-width">
                    <span className="eyebrow">Delivery Detail</span>
                    <p>{selectedInquiry.delivery.message}</p>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
