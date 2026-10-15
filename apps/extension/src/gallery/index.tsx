import { renderPageShell } from '../ui/page-bootstrap';
import '@sniptale/ui/styles';
import '@sniptale/ui/styles/ai-modal';
import '@sniptale/ui/styles/glass';
import '@sniptale/ui/styles/toolbar';
import '@sniptale/ui/styles/overlays';
import { CommandPressScope } from '@sniptale/ui/control-language/press';
import '../ui/compact-inspector-controls/inspector-surface.css';
import './library/library-surface.css';
import { GalleryApp } from './shell/app-shell';
import { GalleryPersistenceAdmission } from './shell/app-shell/persistence-admission';

renderPageShell({
  element: (
    <CommandPressScope.Provider value={true}>
      <div className="sniptale-compact-workspace sniptale-library-workspace">
        <GalleryPersistenceAdmission>
          <GalleryApp />
        </GalleryPersistenceAdmission>
      </div>
    </CommandPressScope.Provider>
  ),
  namespace: 'GalleryEntrypoint',
});
