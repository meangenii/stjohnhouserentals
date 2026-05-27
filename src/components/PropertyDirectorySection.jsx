import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listBedroomGroups } from '../lib/propertyRepository'

export function PropertyDirectorySection({ title, groups: providedGroups = null }) {
  const [state, setState] = useState({ status: 'loading', groups: [] })

  useEffect(() => {
    if (providedGroups) {
      return undefined
    }

    let cancelled = false

    listBedroomGroups()
      .then((groups) => {
        if (!cancelled) {
          setState({ status: 'ready', groups })
        }
      })
      .catch((error) => {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Unknown property directory error'
          setState({ status: 'error', groups: [], message })
        }
      })

    return () => {
      cancelled = true
    }
  }, [providedGroups])

  const groups = providedGroups ?? state.groups
  const isReady = Boolean(providedGroups) || state.status === 'ready'
  const isLoading = !providedGroups && state.status === 'loading'
  const isError = !providedGroups && state.status === 'error'

  return (
    <section className="property-directory">
      <div className="property-directory-inner">
        {title ? <h2 className="property-directory-title">{title}</h2> : null}

        {isLoading ? (
          <p className="property-directory-feedback">Loading properties...</p>
        ) : null}

        {isError ? (
          <p className="property-directory-feedback">
            Property directory is unavailable right now. {state.message}
          </p>
        ) : null}

        {isReady ? (
          <div className="property-directory-grid">
            {groups.map((group) => (
              <section className="property-directory-column" key={group.bedrooms}>
                <div className="property-directory-pill">{group.label}</div>

                <ul className="property-link-list">
                  {group.properties.map((property) => (
                    <li key={property.slug}>
                      <Link className="property-directory-link" to={property.path}>
                        {property.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  )
}
