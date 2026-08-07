import { renderPageShell } from '../ui/page-bootstrap';
import { EditorPage } from './shell/page';
import '@sniptale/ui/styles';
import '@sniptale/ui/styles/ai-modal';
import '@sniptale/ui/styles/glass';
import '@sniptale/ui/styles/toolbar';
import '@sniptale/ui/styles/overlays';
import '../features/highlighter/frame-annotation/interaction/styles.css';
import '../features/highlighter/frame-annotation/callout/font.css';
import '../composition/frame-annotation-controls/frame/styles.css';
import '../composition/frame-annotation-controls/callout/styles.css';
import '../composition/frame-annotation-controls/popover/styles.css';
import { initTracer } from '@sniptale/platform/observability/message-tracer';

// Инициализация трассировщика (только в dev/build режимах)
initTracer('editor');

renderPageShell({
  element: <EditorPage />,
  namespace: 'EditorEntrypoint',
});
