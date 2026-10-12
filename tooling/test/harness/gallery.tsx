import { harnessReady } from './browser-mocks/browser-mocks';
import { createRoot } from 'react-dom/client';
import '@sniptale/ui/styles';
import '@sniptale/ui/styles/ai-modal';
import '@sniptale/ui/styles/glass';
import '@sniptale/ui/styles/toolbar';
import '@sniptale/ui/styles/overlays';
import { initializeAppTheme } from '../../../apps/extension/src/ui/theme/index';
import { installPcmSpeechFixture } from './pcm-speech';
import { GalleryApp } from '../../../apps/extension/src/gallery/shell/app-shell';

initializeAppTheme(new URLSearchParams(location.search).get('theme') === 'dark' ? 'dark' : 'light');

void harnessReady.then(() => {
  if (new URLSearchParams(location.search).get('pcmSpeechFixture') === '1')
    installPcmSpeechFixture();
  createRoot(document.getElementById('root')!).render(<GalleryApp />);
});
