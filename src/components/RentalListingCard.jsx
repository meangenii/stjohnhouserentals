export function RentalListingCard({ listing }) {
  return (
    <article className="rental-card">
      <div className="rental-topline">
        <div>
          <h3>{listing.name}</h3>
          <p>Scraped from the current rental accommodations page.</p>
        </div>
        {listing.rate ? <span className="rental-rate">{listing.rate}</span> : null}
      </div>

      <a className="button-link button-link--ghost external-link" href={listing.href} rel="noreferrer" target="_blank">
        View live listing
      </a>
    </article>
  )
}
