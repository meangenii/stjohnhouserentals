import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { listProperties } from '../lib/propertyRepository'
import { listCharters } from '../lib/charterRepository'
import { coralBayDining, cruzBayDining, islandDining } from '../../shared/localAttractionsDining.js'
import locationCoordinates from '../lib/testPropertyLocationCoordinates.json'
import diningCoordinates from '../lib/testDiningLocationCoordinates.json'
import charterDepartureCoordinates from '../lib/testCharterDepartureCoordinates.json'
import ferryTerminals from '../lib/testFerryTerminals.json'
import '../styles/propertyMapTest.css'

const ST_JOHN_CENTER = [18.3312, -64.744]
const ST_JOHN_DEFAULT_ZOOM = 13
const GOLDEN_ANGLE_RADIANS = 137.508 * (Math.PI / 180)
const SPIRAL_RING_SPACING_DEGREES = 0.00035

const CATEGORY_CONFIG = {
  houses: { label: 'Houses', color: '#1d4ed8' },
  restaurants: { label: 'Restaurants', color: '#dc2626' },
  charterBoats: { label: 'Charter Boats', color: '#16a34a' },
  ferries: { label: 'Ferries', color: '#7c3aed' },
}

// Property/restaurant records only store a neighborhood name, not a street address, so pins
// are placed at the neighborhood's coordinate. Items sharing a neighborhood are fanned out in
// a deterministic sunflower spiral around that point purely so they're each clickable — the
// offset has no geographic meaning beyond "same neighborhood."
function spiralOffset(indexInGroup, groupSize) {
  if (groupSize <= 1) {
    return [0, 0]
  }

  const angle = indexInGroup * GOLDEN_ANGLE_RADIANS
  const radius = SPIRAL_RING_SPACING_DEGREES * Math.sqrt(indexInGroup + 1)
  return [Math.cos(angle) * radius, Math.sin(angle) * radius]
}

function buildFannedPoints(items, resolveCoord, getSortKey) {
  const groups = new Map()

  items.forEach((item) => {
    const coord = resolveCoord(item)

    if (!coord) {
      return
    }

    const key = `${coord.lat},${coord.lng}`

    if (!groups.has(key)) {
      groups.set(key, { coord, items: [] })
    }

    groups.get(key).items.push(item)
  })

  const points = []

  groups.forEach(({ coord, items: groupItems }) => {
    groupItems.sort((a, b) => getSortKey(a).localeCompare(getSortKey(b)))
    groupItems.forEach((item, indexInGroup) => {
      const [offsetLat, offsetLng] = spiralOffset(indexInGroup, groupItems.length)
      points.push({
        item,
        coord,
        lat: coord.lat + offsetLat,
        lng: coord.lng + offsetLng,
      })
    })
  })

  return points
}

function createPinIcon(color) {
  const svg =
    `<svg width="25" height="34" viewBox="0 0 25 34" xmlns="http://www.w3.org/2000/svg">` +
    `<path d="M12.5 0C5.6 0 0 5.6 0 12.5c0 9.4 12.5 21.5 12.5 21.5S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0z" ` +
    `fill="${color}" stroke="#1f2937" stroke-width="1"/>` +
    `<circle cx="12.5" cy="12.5" r="5" fill="#ffffff"/></svg>`

  return L.divIcon({
    html: svg,
    className: 'property-map-test-pin',
    iconSize: [25, 34],
    iconAnchor: [12, 33],
    popupAnchor: [0, -30],
  })
}

function houseMarkerPoints(properties) {
  return buildFannedPoints(
    properties,
    (property) => locationCoordinates[property.location] || null,
    (property) => property.name,
  ).map(({ item: property, lat, lng, coord }) => ({
    lat,
    lng,
    popupHtml:
      `<div class="property-map-test-popup"><strong>${property.name}</strong><br/>${property.location}` +
      `<br/><em>Neighborhood pin — not the exact address</em>` +
      `<br/><a href="${property.path}" target="_blank" rel="noreferrer">View property page</a></div>`,
  }))
}

function restaurantMarkerPoints(restaurants) {
  return buildFannedPoints(
    restaurants,
    (restaurant) => diningCoordinates[restaurant.location] || null,
    (restaurant) => restaurant.name,
  ).map(({ item: restaurant, lat, lng, coord }) => ({
    lat,
    lng,
    popupHtml:
      `<div class="property-map-test-popup"><strong>${restaurant.name}</strong><br/>${restaurant.cuisine || ''}` +
      `<br/>${restaurant.location}${coord.approximate ? ' (approximate)' : ''}` +
      `${restaurant.phone ? `<br/>${restaurant.phone}` : ''}</div>`,
  }))
}

function charterMarkerPoints(charters) {
  return buildFannedPoints(
    charters,
    (charter) => charterDepartureCoordinates[charter.slug] || null,
    (charter) => charter.name,
  ).map(({ item: charter, lat, lng, coord }) => ({
    lat,
    lng,
    popupHtml:
      `<div class="property-map-test-popup"><strong>${charter.name}</strong><br/>${coord.dock}` +
      `${coord.approximate ? ' (approximate)' : ''}` +
      `<br/><a href="${charter.path}" target="_blank" rel="noreferrer">View charter page</a></div>`,
  }))
}

function ferryMarkerPoints(terminals) {
  return terminals.map((terminal) => ({
    lat: terminal.lat,
    lng: terminal.lng,
    popupHtml: `<div class="property-map-test-popup"><strong>${terminal.name}</strong><br/>${terminal.detail}</div>`,
  }))
}

export function PropertyMapTestPage() {
  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const layerGroupsRef = useRef({})
  const [properties, setProperties] = useState(null)
  const [charters, setCharters] = useState(null)
  const [error, setError] = useState('')
  const [activeCategories, setActiveCategories] = useState(() => new Set(Object.keys(CATEGORY_CONFIG)))

  useEffect(() => {
    let cancelled = false

    Promise.all([listProperties(), listCharters()])
      .then(([propertyList, charterList]) => {
        if (!cancelled) {
          setProperties(propertyList)
          setCharters(charterList)
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError?.message || 'Failed to load map data.')
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return undefined
    }

    const map = L.map(mapContainerRef.current).setView(ST_JOHN_CENTER, ST_JOHN_DEFAULT_ZOOM)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map)

    layerGroupsRef.current = Object.fromEntries(
      Object.keys(CATEGORY_CONFIG).map((category) => [category, L.layerGroup().addTo(map)]),
    )

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
      layerGroupsRef.current = {}
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const layerGroups = layerGroupsRef.current

    if (!map || !properties || !charters || Object.keys(layerGroups).length === 0) {
      return undefined
    }

    const icons = Object.fromEntries(
      Object.entries(CATEGORY_CONFIG).map(([category, config]) => [category, createPinIcon(config.color)]),
    )

    const pointsByCategory = {
      houses: houseMarkerPoints(properties),
      restaurants: restaurantMarkerPoints([...cruzBayDining, ...coralBayDining, ...islandDining]),
      charterBoats: charterMarkerPoints(charters),
      ferries: ferryMarkerPoints(ferryTerminals),
    }

    const bounds = []

    Object.entries(pointsByCategory).forEach(([category, points]) => {
      const layerGroup = layerGroups[category]
      layerGroup.clearLayers()

      points.forEach(({ lat, lng, popupHtml }) => {
        L.marker([lat, lng], { icon: icons[category] }).bindPopup(popupHtml).addTo(layerGroup)
        bounds.push([lat, lng])
      })
    })

    if (bounds.length) {
      map.fitBounds(bounds, { padding: [40, 40] })
    }
  }, [properties, charters])

  useEffect(() => {
    const layerGroups = layerGroupsRef.current
    const map = mapRef.current

    if (!map) {
      return
    }

    Object.entries(layerGroups).forEach(([category, layerGroup]) => {
      const shouldShow = activeCategories.has(category)
      const isShown = map.hasLayer(layerGroup)

      if (shouldShow && !isShown) {
        layerGroup.addTo(map)
      } else if (!shouldShow && isShown) {
        map.removeLayer(layerGroup)
      }
    })
  }, [activeCategories])

  function toggleCategory(category) {
    setActiveCategories((current) => {
      const next = new Set(current)

      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }

      return next
    })
  }

  const isLoading = !properties || !charters

  return (
    <div className="property-map-test-page">
      <div className="property-map-test-banner">
        <div>
          <strong>Internal test page</strong> — not linked from site navigation, for testing only. Houses and
          restaurants are placed at their neighborhood (no street address in the data); charter boats at their
          known departure dock; ferries at their real terminal.
          {isLoading ? ' Loading…' : ''}
          {error ? ` Error: ${error}` : ''}
        </div>
        <div className="property-map-test-filters">
          {Object.entries(CATEGORY_CONFIG).map(([category, config]) => (
            <button
              key={category}
              className={`rental-accommodations-pill property-map-test-filter-pill${
                activeCategories.has(category) ? ' rental-accommodations-pill--active' : ''
              }`}
              style={{ '--property-map-test-pill-color': config.color }}
              type="button"
              onClick={() => toggleCategory(category)}
            >
              <span className="property-map-test-filter-dot" />
              {config.label}
            </button>
          ))}
        </div>
      </div>
      <div className="property-map-test-map" ref={mapContainerRef} />
    </div>
  )
}
