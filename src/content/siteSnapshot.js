import snapshot from './liveSiteSnapshot.json'

export const siteSnapshot = snapshot
export const pageSnapshots = snapshot.pages
export const primaryNavItems = snapshot.primaryNavigation
export const travelNavItems = snapshot.travelNavigation
export const legalNavItems = snapshot.legalNavigation
export const secondaryNavItems = snapshot.secondaryNavigation ?? []
export const allNavItems = [
  ...snapshot.primaryNavigation,
  ...snapshot.travelNavigation,
  ...secondaryNavItems,
]
export const snapshotDate = snapshot.snapshotDate
