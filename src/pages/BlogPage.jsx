import { ContentPage } from '../components/ContentPage'
import { PageLoadingState } from '../components/PageLoadingState'
import { useStructuredPageContent } from '../lib/useSiteContent'

export function BlogPage() {
  const page = useStructuredPageContent('blog')

  if (!page) {
    return <PageLoadingState />
  }

  return <ContentPage page={page} />
}
