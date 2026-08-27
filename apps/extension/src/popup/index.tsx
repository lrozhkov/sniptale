import '@sniptale/ui/styles/ai-modal';
import { renderPageShell } from '../ui/page-bootstrap/page-bootstrap';
import { PopupApp } from './shell/app';

performance.mark('sniptale-popup-entry-evaluated');
renderPageShell({
  element: <PopupApp />,
  initializeTheme: false,
  namespace: 'popup',
});
