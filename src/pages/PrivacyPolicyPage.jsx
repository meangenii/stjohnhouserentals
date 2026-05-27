import { SnapshotPage } from '../components/SnapshotPage'
import { pageSnapshots } from '../content/siteSnapshot'

export function PrivacyPolicyPage() {
  return <SnapshotPage eyebrow="Privacy policy" page={pageSnapshots.privacyPolicy} />
}
