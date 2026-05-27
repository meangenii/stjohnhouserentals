import { SnapshotPage } from '../components/SnapshotPage'
import { pageSnapshots } from '../content/siteSnapshot'

export function TermsOfAgreementPage() {
  return <SnapshotPage eyebrow="Terms of agreement" page={pageSnapshots.termsOfAgreement} />
}
