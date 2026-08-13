import { Link } from '../lib/router'

export function AdminViewLiveButton({ onBeforeNavigate, path = '' }) {
  const normalizedPath = String(path ?? '').trim()

  if (!normalizedPath) {
    return null
  }

  function handleClick(event) {
    if (typeof onBeforeNavigate === 'function' && !onBeforeNavigate()) {
      event.preventDefault()
    }
  }

  return (
    <Link
      aria-label="View the live page"
      className="admin-mode-toggle admin-mode-toggle--live"
      title="View the live page"
      to={normalizedPath}
      onClick={handleClick}
    >
      <span aria-hidden="true" className="admin-mode-toggle-icon">
        &#8599;
      </span>
      View Live Page
    </Link>
  )
}

export function AdminBackToSiteButton({ onBeforeNavigate }) {
  function handleClick(event) {
    if (typeof onBeforeNavigate === 'function' && !onBeforeNavigate()) {
      event.preventDefault()
    }
  }

  return (
    <Link
      aria-label="Back to site"
      className="admin-mode-toggle admin-mode-toggle--back"
      title="Back to site"
      to="/"
      onClick={handleClick}
    >
      <span aria-hidden="true" className="admin-mode-toggle-icon">
        &#8592;
      </span>
      Back to site
    </Link>
  )
}
