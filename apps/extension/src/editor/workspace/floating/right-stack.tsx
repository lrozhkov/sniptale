import { useEffect } from 'react';
import { floatingChromeClassNames } from '@sniptale/ui/floating-chrome';
import type { EditorToolbarContentProps } from '../toolbar/types';
import type { EditorFloatingDocumentController } from './document-bar';
import { EditorFloatingLayersPanel } from './layers-panel';

const RIGHT_STACK_CLASS_NAME = floatingChromeClassNames(
  [
    'absolute right-[calc(0.75rem+var(--editor-floating-edge-right,0px))]',
    'top-[12rem] bottom-[calc(0.75rem+var(--editor-floating-edge-bottom,0px))] z-40 flex',
    'w-[min(22rem,calc(100vw-1.5rem-var(--editor-floating-edge-right,0px)))]',
  ].join(' '),
  'flex-col justify-end gap-3',
  'max-[720px]:bottom-[calc(4.75rem+var(--editor-floating-edge-bottom,0px))]'
);

type EditorFloatingRightStackProps = {
  hasImage: boolean;
  inspectorMeta: EditorToolbarContentProps['inspectorMeta'];
  layersCollapsed: boolean;
  layersHeightRatio: number | null;
  layersPreferenceError: string | null;
  documentController: EditorFloatingDocumentController;
  onCollapseLayers: () => void;
  onExpandLayers: () => void;
  onLayersHeightRatioChange: (heightRatio: number | null) => void;
};

function renderLayersPanel(args: EditorFloatingRightStackProps) {
  return (
    <EditorFloatingLayersPanel
      collapsed={args.layersCollapsed && args.documentController.inspector !== 'layer-effects'}
      documentController={args.documentController}
      hasImage={args.hasImage}
      heightRatio={args.layersHeightRatio}
      preferenceError={args.layersPreferenceError}
      onCollapse={args.onCollapseLayers}
      onExpand={args.onExpandLayers}
      onHeightRatioChange={args.onLayersHeightRatioChange}
    />
  );
}

export function EditorFloatingRightStack({
  layersCollapsed,
  layersHeightRatio,
  layersPreferenceError,
  documentController,
  hasImage,
  inspectorMeta,
  onCollapseLayers,
  onExpandLayers,
  onLayersHeightRatioChange,
}: EditorFloatingRightStackProps) {
  useEffect(() => {
    if (layersCollapsed && documentController.inspector === 'layer-effects') onExpandLayers();
  }, [layersCollapsed, documentController.inspector, onExpandLayers]);

  const props = {
    documentController,
    hasImage,
    inspectorMeta,
    layersCollapsed,
    layersHeightRatio,
    layersPreferenceError,
    onCollapseLayers,
    onExpandLayers,
    onLayersHeightRatioChange,
  };
  const layersPanel = renderLayersPanel(props);

  if (layersCollapsed && documentController.inspector !== 'layer-effects') {
    return layersPanel;
  }

  return (
    <div data-ui="editor.floating.right-stack" className={RIGHT_STACK_CLASS_NAME}>
      {layersPanel}
    </div>
  );
}
