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

export function RestaurantDirectoryPanel({ page, updatePath, disabled = false }) {
  const diningSections = getDiningSections(page)
  const restaurantRows = getRestaurantRows(diningSections)
  const isDisabled = disabled || !updatePath

  function setRestaurantField(sectionIndex, restaurantIndex, field, value) {
    updatePath?.(['dining', 'sections', sectionIndex, 'restaurants', restaurantIndex, field], value)
  }

  function setRestaurantArea(sectionIndex, restaurantIndex, nextSectionIndexValue) {
    const nextSectionIndex = Number(nextSectionIndexValue)

    if (!Number.isInteger(nextSectionIndex) || nextSectionIndex === sectionIndex) {
      return
    }

    updatePath?.(['dining', 'sections'], (sections) => {
      const nextSections = Array.isArray(sections) ? cloneValue(sections) : []
      const currentRestaurants = Array.isArray(nextSections[sectionIndex]?.restaurants) ? nextSections[sectionIndex].restaurants : []
      const nextRestaurants = Array.isArray(nextSections[nextSectionIndex]?.restaurants) ? nextSections[nextSectionIndex].restaurants : null

      if (!currentRestaurants[restaurantIndex] || !nextRestaurants) {
        return sections
      }

      const [restaurant] = currentRestaurants.splice(restaurantIndex, 1)
      nextRestaurants.push(restaurant)
      return nextSections
    })
  }

  function addRestaurant() {
    updatePath?.(['dining', 'sections'], (sections) => {
      const nextSections = Array.isArray(sections) ? cloneValue(sections) : []

      if (!nextSections.length) {
        nextSections.push({ id: makeRestaurantItemId(), title: 'Dining Area', restaurants: [] })
      }

      const targetSection = nextSections[0]

      if (!Array.isArray(targetSection.restaurants)) {
        targetSection.restaurants = []
      }

      targetSection.restaurants.push({
        id: makeRestaurantItemId(),
        name: '',
        cuisine: '',
        location: '',
        website: '',
        phone: '',
        active: true,
      })

      return nextSections
    })
  }

  function removeRestaurant(sectionIndex, restaurantIndex) {
    updatePath?.(['dining', 'sections', sectionIndex, 'restaurants'], (restaurants) =>
      Array.isArray(restaurants) ? restaurants.filter((_, index) => index !== restaurantIndex) : restaurants,
    )
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
        <button className="button-link button-link--ghost admin-action" disabled={isDisabled} type="button" onClick={addRestaurant}>
          Add restaurant
        </button>
      </div>

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
