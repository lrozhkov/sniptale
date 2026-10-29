import { CommandPressScope } from '@sniptale/ui/control-language/press';
import { InspectorLayout } from '../ui/compact-inspector-controls/layout';
import '../ui/compact-inspector-controls/inspector-surface.css';
import './image-surface.css';
import { renderPageShell } from '../ui/page-bootstrap';
import { EditorPage } from './shell/page';
import { EditorResourceAdmission } from '../composition/editor-resource-admission';
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

const initialAssetId = new URLSearchParams(window.location.search).get('assetId');
renderPageShell({
  element: (
    <CommandPressScope value={true}>
      <InspectorLayout>
        <div className="sniptale-compact-workspace sniptale-image-workspace sniptale-image-page">
          <EditorResourceAdmission
            root={initialAssetId ? { rootKind: 'media', rootId: initialAssetId } : undefined}
          >
            <EditorPage />
          </EditorResourceAdmission>
        </div>
      </InspectorLayout>
    </CommandPressScope>
  ),
  namespace: 'EditorEntrypoint',
});
