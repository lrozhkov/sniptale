import { harnessReady } from './browser-mocks';
import { createRoot } from 'react-dom/client';
import '@sniptale/ui/styles';
import '@sniptale/ui/styles/ai-modal';
import '@sniptale/ui/styles/glass';
import '@sniptale/ui/styles/toolbar';
import '@sniptale/ui/styles/overlays';
import { initializeAppTheme } from '../../../apps/extension/src/ui/theme/index';
import { GalleryApp } from '../../../apps/extension/src/gallery/shell/app-shell';

initializeAppTheme('light');

void harnessReady.then(() => {
  createRoot(document.getElementById('root')!).render(<GalleryApp />);
});
