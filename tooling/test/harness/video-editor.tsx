import { createRoot } from 'react-dom/client';
import { harnessReady } from './browser-mocks/browser-mocks';
import { EditorResourceAdmission } from '../../../apps/extension/src/composition/editor-resource-admission';
import { App } from '../../../apps/extension/src/video-editor/shell/app';
import '@sniptale/ui/styles';
import '@sniptale/ui/styles/ai-modal';
import '@sniptale/ui/styles/glass';
import '@sniptale/ui/styles/toolbar';
import '@sniptale/ui/styles/overlays';
import '../../../apps/extension/src/video-editor/styles/spacing-compatibility.css';
import '../../../apps/extension/src/video-editor/styles/timeline-items.css';
import { initializeAppTheme } from '../../../apps/extension/src/ui/theme/index';
import { prepareTranslations } from '../../../apps/extension/src/platform/i18n';

initializeAppTheme();

void harnessReady.then(async () => {
  await prepareTranslations('video-editor');
  createRoot(document.getElementById('root')!).render(
    <EditorResourceAdmission>
      <App />
    </EditorResourceAdmission>
  );
});
