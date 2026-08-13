import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from '../lib/router'
import { listBedroomGroups } from '../lib/propertyRepository'
import { comparePropertyNames } from '../lib/propertySort'

const preferredBedroomOrder = new Map([1, 2, 3, 4, 5, 6].map((bedrooms, index) => [bedrooms, index]))

function isUnmodifiedPrimaryClick(event) {
  return event.button === 0 && !event.metaKey && !event.altKey && !event.ctrlKey && !event.shiftKey
}

function getPropertyDirectoryTargetId(slug = '') {
  const normalizedSlug = String(slug ?? '').trim()

  return normalizedSlug ? `property-directory-${normalizedSlug.replace(/[^a-z0-9_-]+/gi, '-')}` : ''
}

export function PropertyDirectorySection({ title, groups: providedGroups = null }) {
  const [state, setState] = useState({ status: 'loading', groups: [] })
  const location = useLocation()
  const navigate = useNavigate()
  const restoredScrollLocationKeyRef = useRef('')

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

  const shouldRestorePropertyReturnPosition = location.state?.restorePropertyReturnPosition === true
  const propertyReturnScrollY = Number(location.state?.propertyReturnScrollY)
  const hasPropertyReturnScrollY = Number.isFinite(propertyReturnScrollY)
  const propertyReturnTargetId =
    typeof location.state?.propertyReturnTargetId === 'string' ? location.state.propertyReturnTargetId : ''

  function handlePropertyNavigate(event, property, groupProperties) {
    if (!isUnmodifiedPrimaryClick(event)) {
      return
    }

    const returnTargetId = getPropertyDirectoryTargetId(property?.slug)
    const filteredPropertyOrder = Array.isArray(groupProperties)
      ? groupProperties.map((groupProperty) => ({
          slug: groupProperty.slug,
          name: groupProperty.name,
          path: groupProperty.path,
        }))
      : []

    event.preventDefault()
    navigate(property.path, {
      state: {
        filteredPropertyOrder,
        propertyReturnPath: `${location.pathname}${location.search}`,
        propertyReturnScrollY: window.scrollY,
        ...(returnTargetId ? { propertyReturnTargetId: returnTargetId } : {}),
      },
    })
  }

  useEffect(() => {
    if (
      !shouldRestorePropertyReturnPosition ||
      !isReady ||
      restoredScrollLocationKeyRef.current === location.key ||
      (!propertyReturnTargetId && !hasPropertyReturnScrollY)
    ) {
      return
    }

    restoredScrollLocationKeyRef.current = location.key

    window.requestAnimationFrame(() => {
      const targetElement = propertyReturnTargetId ? document.getElementById(propertyReturnTargetId) : null

      if (targetElement) {
        targetElement.scrollIntoView({ block: 'nearest', behavior: 'auto' })
        return
      }

      if (hasPropertyReturnScrollY) {
        window.scrollTo({ top: Math.max(0, propertyReturnScrollY), left: 0, behavior: 'auto' })
      }
    })
  }, [
    hasPropertyReturnScrollY,
    isReady,
    location.key,
    propertyReturnScrollY,
    propertyReturnTargetId,
    shouldRestorePropertyReturnPosition,
  ])

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
                    <li id={getPropertyDirectoryTargetId(property.slug) || undefined} key={property.slug}>
                      <Link
                        className="property-directory-link"
                        to={property.path}
                        onClick={(event) => handlePropertyNavigate(event, property, group.properties)}
                      >
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
