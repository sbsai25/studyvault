import { Compass } from 'lucide-react';
import Page from '../components/layout/Page';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';

function NotFound() {
  return (
    <Page title="Page not found" width="narrow">
      <EmptyState
        icon={Compass}
        titleAs="h1"
        title="This page doesn't exist"
        description="The link may be broken, or the page may have moved."
      >
        <Button to="/">Go to the dashboard</Button>
      </EmptyState>
    </Page>
  );
}

export default NotFound;
