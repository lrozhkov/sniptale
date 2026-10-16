import { ArrowLeft } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import { EditorInspectorContent } from '../../inspector/content';
import { createEditorInspectorContentPanelProps } from '../../inspector/sidebar-expanded-content/helpers';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import type { EditorFloatingDocumentController } from './document-bar';

export function EditorFloatingLayerEffectsPanel({
  documentController,
  hasImage,
}: {
  documentController: EditorFloatingDocumentController;
  hasImage: boolean;
}) {
  const contentProps = createEditorInspectorContentPanelProps(hasImage, documentController);

  return (
    <div data-ui="editor.floating.layer-effects-panel" className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-[var(--sniptale-color-border-soft)] px-3 py-2">
        <ProductActionButton
          compact
          tone="secondary"
          onClick={() => documentController.setInspector('tool')}
          data-ui="editor.floating.layer-effects-panel.back"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          {translate('editor.toolbar.layerEffectsBackToLayers')}
        </ProductActionButton>
      </div>
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 pb-3 [scrollbar-gutter:stable]">
        <EditorInspectorContent
          {...contentProps}
          inspector="layer-effects"
          showDocumentActions={false}
          confirmDialog={null}
        />
      </div>
    </div>
  );
}
