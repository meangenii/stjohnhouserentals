import { Link } from '../lib/router'

const DEFAULT_PROPERTY_RETURN_PATH = '/'

function getSafePropertyReturnPath(value) {
  const candidate = String(value ?? '').trim()

  // Must be a root-relative in-app path, not a protocol-relative or absolute URL
  // (which could redirect off-site if a caller ever passed one through router state).
  if (candidate.startsWith('/') && !candidate.startsWith('//') && !candidate.startsWith('/\\')) {
    return candidate
  }

  return DEFAULT_PROPERTY_RETURN_PATH
}

export function ReturnToPropertiesButton({ returnPath = DEFAULT_PROPERTY_RETURN_PATH, returnState = undefined }) {
  return (
    <Link
      aria-label="Back to properties list"
      className="return-to-properties"
      title="Back to properties list"
      state={returnState}
      to={getSafePropertyReturnPath(returnPath)}
    >
      <span aria-hidden="true" className="return-to-properties-icon">
        &larr;
      </span>
      <span className="return-to-properties-label">Properties</span>
    </Link>
  )
}
