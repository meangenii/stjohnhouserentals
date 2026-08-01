import { useEffect, useRef, useState } from 'react'

function cloneValue(value) {
  if (value === undefined) {
    return undefined
  }

  return JSON.parse(JSON.stringify(value))
}

function makeRestaurantItemId() {
  return `item-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function getDiningSections(page) {
  return Array.isArray(page?.dining?.sections) ? page.dining.sections : []
}

function getRestaurantRows(diningSections) {
  return diningSections.flatMap((section, sectionIndex) =>
    (Array.isArray(section?.restaurants) ? section.restaurants : []).map((restaurant, restaurantIndex) => ({
      restaurant,
      restaurantIndex,
      sectionIndex,
    })),
  )
}

function createRestaurantDraft(sectionIndex = 0) {
  return {
    sectionIndex,
    name: '',
    cuisine: '',
    location: '',
    website: '',
    phone: '',
    active: true,
  }
}

function createRestaurantFromDraft(draft) {
  return {
    id: makeRestaurantItemId(),
    name: String(draft.name ?? '').trim(),
    cuisine: String(draft.cuisine ?? '').trim(),
    location: String(draft.location ?? '').trim(),
    website: String(draft.website ?? '').trim(),
    phone: String(draft.phone ?? '').trim(),
    active: draft.active !== false,
  }
}

function getWritableDiningSections(diningSections) {
  const nextSections = Array.isArray(diningSections) ? cloneValue(diningSections) : []

  if (!nextSections.length) {
    nextSections.push({ id: makeRestaurantItemId(), title: 'Dining Area', restaurants: [] })
  }

  return nextSections
}

export function RestaurantDirectoryPanel({ page, updatePath, disabled = false }) {
  const diningSections = getDiningSections(page)
  const restaurantRows = getRestaurantRows(diningSections)
  const isDisabled = disabled || !updatePath
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [restaurantDraft, setRestaurantDraft] = useState(() => createRestaurantDraft())
  const firstDraftInputRef = useRef(null)

  useEffect(() => {
    if (!isAddDialogOpen) {
      return undefined
    }

    const frameId = window.requestAnimationFrame(() => {
      firstDraftInputRef.current?.focus()
    })

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        closeAddDialog()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      window.cancelAnimationFrame(frameId)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isAddDialogOpen])

  function setRestaurantField(sectionIndex, restaurantIndex, field, value) {
    updatePath?.(['dining', 'sections', sectionIndex, 'restaurants', restaurantIndex, field], value)
  }

  function updateDiningSections(nextSections) {
    updatePath?.(['dining', 'sections'], nextSections)
  }

  function setRestaurantArea(sectionIndex, restaurantIndex, nextSectionIndexValue) {
    const nextSectionIndex = Number(nextSectionIndexValue)

    if (!Number.isInteger(nextSectionIndex) || nextSectionIndex === sectionIndex) {
      return
    }

    const nextSections = Array.isArray(diningSections) ? cloneValue(diningSections) : []
    const currentRestaurants = Array.isArray(nextSections[sectionIndex]?.restaurants) ? nextSections[sectionIndex].restaurants : []
    const nextRestaurants = Array.isArray(nextSections[nextSectionIndex]?.restaurants) ? nextSections[nextSectionIndex].restaurants : null

    if (!currentRestaurants[restaurantIndex] || !nextRestaurants) {
      return
    }

    const [restaurant] = currentRestaurants.splice(restaurantIndex, 1)
    nextRestaurants.push(restaurant)
    updateDiningSections(nextSections)
  }

  function openAddDialog() {
    if (isDisabled) {
      return
    }

    setRestaurantDraft(createRestaurantDraft(0))
    setIsAddDialogOpen(true)
  }

  function closeAddDialog() {
    setIsAddDialogOpen(false)
  }

  function setDraftField(field, value) {
    setRestaurantDraft((currentDraft) => ({ ...currentDraft, [field]: value }))
  }

  function finishAddRestaurant(event) {
    event.preventDefault()

    if (isDisabled) {
      return
    }

    const nextSections = getWritableDiningSections(diningSections)
    const requestedSectionIndex = Number(restaurantDraft.sectionIndex)
    const targetSectionIndex =
      Number.isInteger(requestedSectionIndex) && requestedSectionIndex >= 0 && requestedSectionIndex < nextSections.length ? requestedSectionIndex : 0
    const targetSection = nextSections[targetSectionIndex]

    if (!Array.isArray(targetSection.restaurants)) {
      targetSection.restaurants = []
    }

    targetSection.restaurants.push(createRestaurantFromDraft(restaurantDraft))
    updateDiningSections(nextSections)
    closeAddDialog()
  }

  function removeRestaurant(sectionIndex, restaurantIndex) {
    const nextSections = Array.isArray(diningSections) ? cloneValue(diningSections) : []
    const targetRestaurants = Array.isArray(nextSections[sectionIndex]?.restaurants) ? nextSections[sectionIndex].restaurants : null

    if (!targetRestaurants) {
      return
    }

    targetRestaurants.splice(restaurantIndex, 1)
    updateDiningSections(nextSections)
  }

  function handleDialogBackdropMouseDown(event) {
    event.stopPropagation()

    if (event.target === event.currentTarget) {
      closeAddDialog()
    }
  }

  function stopDialogEvent(event) {
    event.stopPropagation()
  }

  if (!page) {
    return null
  }

  return (
    <section className="admin-content-section admin-restaurant-directory-panel" data-admin-inline-editable="true">
      <div className="admin-content-section-header">
        <div>
          <h4>Restaurants</h4>
          <p>One row per restaurant. Deactivated restaurants stay saved here but are hidden from the public dining guide.</p>
        </div>
        <button className="button-link button-link--ghost admin-action" disabled={isDisabled} type="button" onClick={openAddDialog}>
          Add restaurant
        </button>
      </div>

      {isAddDialogOpen ? (
        <div className="admin-restaurant-add-dialog-shell" role="presentation" onMouseDown={handleDialogBackdropMouseDown} onClick={stopDialogEvent}>
          <form
            aria-label="Add restaurant"
            aria-modal="true"
            className="admin-restaurant-add-dialog"
            role="dialog"
            onMouseDown={stopDialogEvent}
            onSubmit={finishAddRestaurant}
          >
            <div className="admin-restaurant-add-dialog-header">
              <strong>Add restaurant</strong>
              <button className="button-link button-link--ghost" type="button" onClick={closeAddDialog}>
                Cancel
              </button>
            </div>

            <div className="admin-restaurant-add-grid">
              <label className="admin-restaurant-add-field">
                <span>Area</span>
                <select value={restaurantDraft.sectionIndex} onChange={(event) => setDraftField('sectionIndex', Number(event.target.value))}>
                  {diningSections.length > 0 ? (
                    diningSections.map((diningSection, diningSectionIndex) => (
                      <option key={diningSection?.id ?? diningSectionIndex} value={diningSectionIndex}>
                        {diningSection?.title || `Dining Area ${diningSectionIndex + 1}`}
                      </option>
                    ))
                  ) : (
                    <option value={0}>Dining Area</option>
                  )}
                </select>
              </label>

              <label className="admin-restaurant-add-field">
                <span>Name</span>
                <input
                  ref={firstDraftInputRef}
                  placeholder="Restaurant name"
                  required
                  type="text"
                  value={restaurantDraft.name}
                  onChange={(event) => setDraftField('name', event.target.value)}
                />
              </label>

              <label className="admin-restaurant-add-field">
                <span>Cuisine</span>
                <input
                  placeholder="Cuisine"
                  type="text"
                  value={restaurantDraft.cuisine}
                  onChange={(event) => setDraftField('cuisine', event.target.value)}
                />
              </label>

              <label className="admin-restaurant-add-field">
                <span>Location</span>
                <input
                  placeholder="Location"
                  type="text"
                  value={restaurantDraft.location}
                  onChange={(event) => setDraftField('location', event.target.value)}
                />
              </label>

              <label className="admin-restaurant-add-field">
                <span>Website URL</span>
                <input
                  placeholder="https://example.com"
                  type="text"
                  value={restaurantDraft.website}
                  onChange={(event) => setDraftField('website', event.target.value)}
                />
              </label>

              <label className="admin-restaurant-add-field">
                <span>Phone</span>
                <input
                  placeholder="340-555-1234"
                  type="text"
                  value={restaurantDraft.phone}
                  onChange={(event) => setDraftField('phone', event.target.value)}
                />
              </label>
            </div>

            <label className="admin-checkbox-field">
              <input
                checked={restaurantDraft.active}
                type="checkbox"
                onChange={(event) => setDraftField('active', event.target.checked)}
              />
              Active
            </label>

            <div className="admin-restaurant-add-dialog-actions">
              <button className="button-link button-link--ghost" type="button" onClick={closeAddDialog}>
                Cancel
              </button>
              <button className="button-link admin-action" type="submit">
                Finish
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <div className="admin-restaurant-directory-list">
        <div className="admin-restaurant-directory-row admin-restaurant-directory-row--header">
          <span>Area</span>
          <span>Name</span>
          <span>Cuisine</span>
          <span>Location</span>
          <span>Website URL</span>
          <span>Phone</span>
          <span>Active</span>
          <span />
        </div>

        {restaurantRows.length === 0 ? <p className="admin-note">No restaurants yet.</p> : null}

        {restaurantRows.map(({ restaurant, restaurantIndex, sectionIndex }) => {
          const isActive = restaurant?.active !== false

          return (
            <div className="admin-restaurant-directory-row" key={restaurant?.id ?? `${sectionIndex}-${restaurantIndex}-${restaurant?.name ?? ''}`}>
              <select disabled={isDisabled} value={sectionIndex} onChange={(event) => setRestaurantArea(sectionIndex, restaurantIndex, event.target.value)}>
                {diningSections.map((diningSection, diningSectionIndex) => (
                  <option key={diningSection?.id ?? diningSectionIndex} value={diningSectionIndex}>
                    {diningSection?.title || `Dining Area ${diningSectionIndex + 1}`}
                  </option>
                ))}
              </select>
              <input
                disabled={isDisabled}
                placeholder="Restaurant name"
                type="text"
                value={restaurant?.name ?? ''}
                onChange={(event) => setRestaurantField(sectionIndex, restaurantIndex, 'name', event.target.value)}
              />
              <input
                disabled={isDisabled}
                placeholder="Cuisine"
                type="text"
                value={restaurant?.cuisine ?? ''}
                onChange={(event) => setRestaurantField(sectionIndex, restaurantIndex, 'cuisine', event.target.value)}
              />
              <input
                disabled={isDisabled}
                placeholder="Location"
                type="text"
                value={restaurant?.location ?? ''}
                onChange={(event) => setRestaurantField(sectionIndex, restaurantIndex, 'location', event.target.value)}
              />
              <input
                disabled={isDisabled}
                placeholder="https://example.com"
                type="text"
                value={restaurant?.website ?? ''}
                onChange={(event) => setRestaurantField(sectionIndex, restaurantIndex, 'website', event.target.value)}
              />
              <input
                disabled={isDisabled}
                placeholder="340-555-1234"
                type="text"
                value={restaurant?.phone ?? ''}
                onChange={(event) => setRestaurantField(sectionIndex, restaurantIndex, 'phone', event.target.value)}
              />
              <label className="admin-checkbox-field admin-checkbox-field--compact">
                <input
                  checked={isActive}
                  disabled={isDisabled}
                  type="checkbox"
                  onChange={(event) => setRestaurantField(sectionIndex, restaurantIndex, 'active', event.target.checked)}
                />
              </label>
              <button className="button-link button-link--ghost" disabled={isDisabled} type="button" onClick={() => removeRestaurant(sectionIndex, restaurantIndex)}>
                Delete
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}
