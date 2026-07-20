import { renderPageShell } from '../ui/page-bootstrap';
import '@sniptale/ui/styles';
import '@sniptale/ui/styles/ai-modal';
import '@sniptale/ui/styles/glass';
import '@sniptale/ui/styles/toolbar';
import '@sniptale/ui/styles/overlays';
import { GalleryApp } from './shell/app-shell';

renderPageShell({
  element: <GalleryApp />,
  namespace: 'GalleryEntrypoint',
});
