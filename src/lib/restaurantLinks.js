export function buildRestaurantOnlineHref(restaurant) {
  const website = String(restaurant?.website ?? '').trim()

  if (website) {
    return /^https?:\/\//i.test(website) ? website : `https://${website}`
  }

  const searchQuery = [restaurant?.name, restaurant?.location, 'St. John USVI'].filter(Boolean).join(' ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchQuery)}`
}
