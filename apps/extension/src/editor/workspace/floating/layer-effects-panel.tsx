import { X } from 'lucide-react';
import { FloatingChromePanel, floatingChromeClassNames } from '@sniptale/ui/floating-chrome';
import { translate } from '../../../platform/i18n';
import { EditorInspectorContent } from '../../inspector/content';
import { createEditorInspectorContentPanelProps } from '../../inspector/sidebar-expanded-content/helpers';
import { EditorIconButton } from '../../chrome/ui';
import type { EditorToolbarContentProps } from '../toolbar/types';
import type { EditorFloatingDocumentController } from './document-bar';

const LAYER_EFFECTS_PANEL_CLASS_NAME = floatingChromeClassNames(
  [
    'absolute bottom-0 right-[calc(100%+0.75rem)] z-40',
    'flex h-[min(40rem,calc(100vh-13rem))] min-h-0 w-[21rem]',
    'flex-col overflow-hidden',
  ].join(' ')
);

const LAYER_EFFECTS_PANEL_COLLAPSED_CLASS_NAME = floatingChromeClassNames(
  [
    'absolute right-[calc(0.75rem+var(--editor-floating-edge-right,0px))]',
    'bottom-[calc(4.5rem+var(--editor-floating-edge-bottom,0px))] z-40',
    'flex min-h-0 max-h-[min(30rem,calc(100vh-6rem))]',
    'w-[min(21rem,calc(100vw-1.5rem-var(--editor-floating-edge-right,0px)))]',
    'flex-col overflow-hidden',
    'max-[720px]:bottom-[calc(8.5rem+var(--editor-floating-edge-bottom,0px))]',
  ].join(' ')
);

const LAYER_EFFECTS_HEADER_CLASS_NAME = [
  'flex shrink-0 items-center gap-3 border-b px-4 py-3',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_76%,transparent)]',
].join(' ');

const LAYER_EFFECTS_HEADER_TITLE_CLASS_NAME =
  'truncate text-[12px] font-bold uppercase leading-4 text-[color:var(--sniptale-color-text-secondary)]';

const LAYER_EFFECTS_BODY_CLASS_NAME =
  'min-h-0 overflow-x-hidden overflow-y-auto p-4 [scrollbar-gutter:stable_both-edges]';

function LayerEffectsPanelBody({
  documentController,
  hasImage,
  inspectorMeta,
}: Pick<EditorToolbarContentProps, 'hasImage' | 'inspectorMeta'> & {
  documentController: EditorFloatingDocumentController;
}) {
  const contentProps = createEditorInspectorContentPanelProps(hasImage, documentController);

  return (
    <>
      <div className={LAYER_EFFECTS_HEADER_CLASS_NAME}>
        <div className="min-w-0 flex-1">
          <div className={LAYER_EFFECTS_HEADER_TITLE_CLASS_NAME}>{inspectorMeta.title}</div>
        </div>
        <EditorIconButton
          title={translate('common.actions.close')}
          onClick={() => documentController.setInspector('tool')}
          data-ui="editor.floating.layer-effects-panel.close-button"
        >
          <X size={16} strokeWidth={2} />
        </EditorIconButton>
      </div>
      <div className={LAYER_EFFECTS_BODY_CLASS_NAME}>
        <EditorInspectorContent
          {...contentProps}
          inspector="layer-effects"
          showDocumentActions={false}
          confirmDialog={null}
        />
      </div>
    </>
  );
}

export function EditorFloatingLayerEffectsPanel({
  collapsedLayers,
  documentController,
  hasImage,
  inspectorMeta,
}: Pick<EditorToolbarContentProps, 'hasImage' | 'inspectorMeta'> & {
  collapsedLayers: boolean;
  documentController: EditorFloatingDocumentController;
}) {
  return (
    <FloatingChromePanel
      dataUi="editor.floating.layer-effects-panel"
      className={
        collapsedLayers ? LAYER_EFFECTS_PANEL_COLLAPSED_CLASS_NAME : LAYER_EFFECTS_PANEL_CLASS_NAME
      }
    >
      <LayerEffectsPanelBody
        documentController={documentController}
        hasImage={hasImage}
        inspectorMeta={inspectorMeta}
      />
    </FloatingChromePanel>
  );
}
