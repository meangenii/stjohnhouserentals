import { ContentPage } from '../components/ContentPage'
import { useStructuredPageContent } from '../lib/useSiteContent'

export function BlogPage() {
  const page = useStructuredPageContent('blog')
  return <ContentPage page={page} />
}
