import { renderPageShell } from '../ui/page-bootstrap';
import '@sniptale/ui/styles';
import '@sniptale/ui/styles/ai-modal';
import '@sniptale/ui/styles/glass';
import '@sniptale/ui/styles/toolbar';
import '@sniptale/ui/styles/overlays';
import { GalleryApp } from './shell/app-shell';
import { GalleryPersistenceAdmission } from './shell/app-shell/persistence-admission';

renderPageShell({
  element: (
    <GalleryPersistenceAdmission>
      <GalleryApp />
    </GalleryPersistenceAdmission>
  ),
  namespace: 'GalleryEntrypoint',
});
