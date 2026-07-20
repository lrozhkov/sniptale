import { createRoot } from 'react-dom/client';
import { harnessReady } from './browser-mocks';
import { App } from '../../../apps/extension/src/video-editor/shell/app';
import '@sniptale/ui/styles';
import '@sniptale/ui/styles/ai-modal';
import '@sniptale/ui/styles/glass';
import '@sniptale/ui/styles/toolbar';
import '@sniptale/ui/styles/overlays';
import { initializeAppTheme } from '../../../apps/extension/src/ui/theme/index';

initializeAppTheme();

void harnessReady.then(() => {
  createRoot(document.getElementById('root')!).render(<App />);
});
