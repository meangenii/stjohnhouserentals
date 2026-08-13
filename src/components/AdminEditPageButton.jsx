import { Link, useLocation } from '../lib/router'
import { buildAdminEditorHref, resolveAdminEditTarget } from '../lib/adminEditTarget'

export function AdminEditPageButton() {
  const location = useLocation()
  const target = resolveAdminEditTarget(location.pathname)

  if (!target) {
    return null
  }

  return (
    <Link
      aria-label="Edit this page"
      className="admin-mode-toggle admin-mode-toggle--edit"
      title="Edit this page"
      to={buildAdminEditorHref(target)}
    >
      <span aria-hidden="true" className="admin-mode-toggle-icon">
        &#9998;
      </span>
      Edit This Page
    </Link>
  )
}
