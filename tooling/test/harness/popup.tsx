import { harnessReady } from './browser-mocks';
import { createRoot } from 'react-dom/client';
import { initializeAppTheme } from '../../../apps/extension/src/ui/theme/index';

initializeAppTheme();

void harnessReady.then(() => {
  void import('../../../apps/extension/src/popup/shell/app').then(({ PopupApp }) => {
    createRoot(document.getElementById('root')!).render(<PopupApp />);
  });
});
