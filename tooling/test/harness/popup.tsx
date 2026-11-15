import { harnessReady } from './browser-mocks/browser-mocks';
import { createRoot } from 'react-dom/client';
import { initializeAppTheme } from '../../../apps/extension/src/ui/theme/index';
import { prepareTranslations } from '../../../apps/extension/src/platform/i18n';

initializeAppTheme();

void harnessReady.then(async () => {
  await prepareTranslations('popup');
  void import('../../../apps/extension/src/popup/shell/app').then(({ PopupApp }) => {
    createRoot(document.getElementById('root')!).render(<PopupApp />);
  });
});
