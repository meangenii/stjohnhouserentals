import { ListingCard } from '../components/ListingCard'
import { SnapshotPage } from '../components/SnapshotPage'
import { pageSnapshots } from '../content/siteSnapshot'

export function HouseRentalsPage() {
  const page = pageSnapshots.houseRentals
  const excludedImageUrls = page.rentalListings?.map((listing) => listing.image?.url).filter(Boolean) ?? []

  return (
    <SnapshotPage excludedImageUrls={excludedImageUrls} page={page}>
      {page.rentalListings?.length ? (
        <section className="snapshot-listings" aria-label="House rental listings">
          <div className="snapshot-listing-grid">
            {page.rentalListings.map((listing) => (
              <ListingCard item={listing} key={listing.path ?? listing.href} />
            ))}
          </div>
        </section>
      ) : null}
    </SnapshotPage>
  )
}
