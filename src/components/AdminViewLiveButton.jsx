import { Link } from 'react-router-dom'

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
