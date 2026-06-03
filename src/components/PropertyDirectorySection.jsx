import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listBedroomGroups } from '../lib/propertyRepository'
import { comparePropertyNames } from '../lib/propertySort'

const preferredBedroomOrder = new Map([1, 2, 3, 4, 5, 6].map((bedrooms, index) => [bedrooms, index]))

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

  const groups = Array.isArray(providedGroups) ? providedGroups : Array.isArray(state.groups) ? state.groups : []
  const isReady = Boolean(providedGroups) || state.status === 'ready'
  const isLoading = !providedGroups && state.status === 'loading'
  const isError = !providedGroups && state.status === 'error'
  const visibleGroups = groups
    .filter(Boolean)
    .map((group) => ({
      bedrooms: group?.bedrooms ?? 0,
      label: String(group?.label ?? '').trim() || 'Available Rentals',
      properties: Array.isArray(group?.properties)
        ? group.properties.filter(
            (property) =>
              property &&
              typeof property.slug === 'string' &&
              typeof property.path === 'string' &&
              typeof property.name === 'string',
          ).sort(comparePropertyNames)
        : [],
    }))
    .filter((group) => group.properties.length > 0)
    .sort((leftGroup, rightGroup) => {
      const leftPreferredIndex = preferredBedroomOrder.get(leftGroup.bedrooms)
      const rightPreferredIndex = preferredBedroomOrder.get(rightGroup.bedrooms)

      if (leftPreferredIndex !== undefined || rightPreferredIndex !== undefined) {
        if (leftPreferredIndex === undefined) {
          return 1
        }

        if (rightPreferredIndex === undefined) {
          return -1
        }

        return leftPreferredIndex - rightPreferredIndex
      }

      return leftGroup.bedrooms - rightGroup.bedrooms || leftGroup.label.localeCompare(rightGroup.label)
    })

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

        {isReady && visibleGroups.length > 0 ? (
          <div className="property-directory-grid">
            {visibleGroups.map((group) => (
              <section className="property-directory-column" key={`${group.bedrooms}-${group.label}`}>
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
        ) : isReady ? (
          <p className="property-directory-feedback">Property directory is unavailable right now.</p>
        ) : null}
      </div>
    </section>
  )
}
