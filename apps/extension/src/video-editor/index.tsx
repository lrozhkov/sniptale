import { renderPageShell } from '../ui/page-bootstrap';
import { App } from './shell/app';
import { EditorResourceAdmission } from '../composition/editor-resource-admission';
import { initTracer } from '@sniptale/platform/observability/message-tracer';
import '@sniptale/ui/styles';
import '@sniptale/ui/styles/ai-modal';
import '@sniptale/ui/styles/glass';
import '@sniptale/ui/styles/toolbar';
import '@sniptale/ui/styles/overlays';
import './styles/spacing-compatibility.css';
import './styles/playback-focus.css';
import './styles/timeline-items.css';

// Инициализация трассировщика (только в dev/build режимах)
initTracer('video-editor');

renderPageShell({
  element: (
    <EditorResourceAdmission>
      <App />
    </EditorResourceAdmission>
  ),
  namespace: 'VideoEditorEntrypoint',
  strictMode: true,
});
