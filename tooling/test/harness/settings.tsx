import { harnessReady } from './browser-mocks';
import { createRoot } from 'react-dom/client';
import { SettingsPage } from '../../../apps/extension/src/settings/shell/page';
import '@sniptale/ui/styles';
import '@sniptale/ui/styles/ai-modal';
import '@sniptale/ui/styles/glass';
import '@sniptale/ui/styles/toolbar';
import '@sniptale/ui/styles/overlays';
import { initializeAppTheme } from '../../../apps/extension/src/ui/theme';

initializeAppTheme();

function App() {
  return <SettingsPage />;
}

void harnessReady.then(() => {
  createRoot(document.getElementById('root')!).render(<App />);
});
