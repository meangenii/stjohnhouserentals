import { SnapshotPage } from '../components/SnapshotPage'
import { pageSnapshots } from '../content/siteSnapshot'

export function LocalAttractionsPage() {
  return <SnapshotPage eyebrow="Local attractions" page={pageSnapshots.localAttractions} />
}
