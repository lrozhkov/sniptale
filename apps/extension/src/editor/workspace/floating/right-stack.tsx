import { floatingChromeClassNames } from '@sniptale/ui/floating-chrome';
import type { EditorToolbarContentProps } from '../toolbar/types';
import type { EditorFloatingDocumentController } from './document-bar';
import { EditorFloatingLayerEffectsPanel } from './layer-effects-panel';
import { EditorFloatingLayersPanel } from './layers-panel';

const RIGHT_STACK_CLASS_NAME = floatingChromeClassNames(
  [
    'absolute right-[calc(0.75rem+var(--editor-floating-edge-right,0px))]',
    'top-[12rem] bottom-[calc(0.75rem+var(--editor-floating-edge-bottom,0px))] z-40 flex',
    'w-[min(21rem,calc(100vw-1.5rem-var(--editor-floating-edge-right,0px)))]',
  ].join(' '),
  'flex-col justify-end gap-3',
  'max-[720px]:hidden'
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

function renderLayerEffectsPanel(args: EditorFloatingRightStackProps) {
  if (args.documentController.inspector !== 'layer-effects') {
    return null;
  }

  return (
    <EditorFloatingLayerEffectsPanel
      collapsedLayers={args.layersCollapsed}
      documentController={args.documentController}
      hasImage={args.hasImage}
      inspectorMeta={args.inspectorMeta}
    />
  );
}

function renderLayersPanel(args: EditorFloatingRightStackProps) {
  return (
    <EditorFloatingLayersPanel
      collapsed={args.layersCollapsed}
      documentController={args.documentController}
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
  const layerEffectsPanel = renderLayerEffectsPanel(props);
  const layersPanel = renderLayersPanel(props);

  if (layersCollapsed) {
    return (
      <>
        {layerEffectsPanel}
        {layersPanel}
      </>
    );
  }

  return (
    <div data-ui="editor.floating.right-stack" className={RIGHT_STACK_CLASS_NAME}>
      {layerEffectsPanel}
      {layersPanel}
    </div>
  );
}
