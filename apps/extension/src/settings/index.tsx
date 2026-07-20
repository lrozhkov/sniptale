import { renderPageShell } from '../ui/page-bootstrap';
import { SettingsPage } from './shell/page';
import '@sniptale/ui/styles';
import '@sniptale/ui/styles/ai-modal';
import '@sniptale/ui/styles/glass';
import '@sniptale/ui/styles/toolbar';
import '@sniptale/ui/styles/overlays';

renderPageShell({
  element: <SettingsPage />,
  namespace: 'SettingsEntrypoint',
});
