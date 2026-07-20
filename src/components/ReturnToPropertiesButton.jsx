import { Link } from 'react-router-dom'

const DEFAULT_PROPERTY_RETURN_PATH = '/for-rent'

function getSafePropertyReturnPath(value) {
  const candidate = String(value ?? '').trim()

  if (candidate === DEFAULT_PROPERTY_RETURN_PATH || candidate.startsWith(`${DEFAULT_PROPERTY_RETURN_PATH}?`) || candidate.startsWith(`${DEFAULT_PROPERTY_RETURN_PATH}#`)) {
    return candidate
  }

  return DEFAULT_PROPERTY_RETURN_PATH
}

export function ReturnToPropertiesButton({ returnPath = DEFAULT_PROPERTY_RETURN_PATH }) {
  return (
    <Link
      aria-label="Return to properties"
      className="return-to-properties"
      title="Return to properties"
      to={getSafePropertyReturnPath(returnPath)}
    >
      <span aria-hidden="true" className="return-to-properties-icon">
        &larr;
      </span>
    </Link>
  )
}
