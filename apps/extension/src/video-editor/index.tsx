import { renderPageShell } from '../ui/page-bootstrap';
import { App } from './shell/app';
import { initTracer } from '@sniptale/platform/observability/message-tracer';
import '@sniptale/ui/styles';
import '@sniptale/ui/styles/ai-modal';
import '@sniptale/ui/styles/glass';
import '@sniptale/ui/styles/toolbar';
import '@sniptale/ui/styles/overlays';

// Инициализация трассировщика (только в dev/build режимах)
initTracer('video-editor');

renderPageShell({
  element: <App />,
  namespace: 'VideoEditorEntrypoint',
  strictMode: true,
});
