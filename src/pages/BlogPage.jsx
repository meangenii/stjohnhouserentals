import { SnapshotPage } from '../components/SnapshotPage'
import { pageSnapshots } from '../content/siteSnapshot'

export function BlogPage() {
  return <SnapshotPage page={pageSnapshots.blog} />
}
