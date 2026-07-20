import type {
  BrowserFrameState,
  EditorSelectionState,
  EditorShapeSettings,
  EditorTool,
  EditorWorkspaceSettings,
} from '../../../features/editor/document/types';
import type { EditorRichShapeDocumentObject } from '../../../features/editor/document/rich-shape';
import type { EditorToolSettings } from '../../../features/editor/document/tool-settings-types';

import { EditorInspectorBrowserFramePanel } from '../environment';
import type { CompactSelectOption } from '../../chrome/ui';
import { EditorInspectorLayerEffectsPanel } from '../layer-effects';
import { pickLayerEffectControlProps } from '../layer-effects/props';

import { renderEditorInspectorContentToolsSections } from './tools';
import { renderEditorInspectorContentWorkspaceSections } from './workspace';
import type { EditorInspectorContentProps } from '../content/types';
import type { EditorInspectorPresetHeaderState } from '../presets';

export interface EditorInspectorContentSurfaceSectionsProps {
  inspector: string;
  browserFrame: BrowserFrameState;
  workspace: EditorWorkspaceSettings;
  selection: EditorSelectionState;
  cropReady: boolean;
  highlightedTool: EditorTool;
  scenePresetHeader: EditorInspectorPresetHeaderState | null;
  inspectorToolSettings: EditorToolSettings;
  richShapeSelection: EditorRichShapeDocumentObject | null;
  toolPresetHeader: EditorInspectorPresetHeaderState | null;
  recentColors: string[];
  borderPresetOptions: CompactSelectOption<string>[];
  frameBackgroundPalette: readonly string[];
  canDeleteSelection: boolean;
  isResizableLayerSelection: boolean;
  layerSizeText: string;
  layerSizeDraft: { width: number; height: number };
  layerSizeLocked: boolean;
  layerAspectRatio: number | null;
  arrowVariantOptions: CompactSelectOption<EditorToolSettings['arrow']['variant']>[];
  arrowTypeOptions: CompactSelectOption<NonNullable<EditorToolSettings['arrow']['arrowType']>>[];
  arrowModeOptions: CompactSelectOption<EditorToolSettings['arrow']['mode']>[];
  arrowHeadOptions: CompactSelectOption<EditorToolSettings['arrow']['startHead']>[];
  lineStyleOptions: CompactSelectOption<EditorToolSettings['line']['style']>[];
  lineCornerOptions: CompactSelectOption<EditorToolSettings['line']['corners']>[];
  lineFillModeOptions: CompactSelectOption<EditorToolSettings['line']['fillMode']>[];
  lineRoughFillStyleOptions: CompactSelectOption<EditorToolSettings['line']['roughFillStyle']>[];
  blurTypeOptions: CompactSelectOption<EditorToolSettings['blur']['blurType']>[];
  browserCanvasModeOptions: CompactSelectOption<BrowserFrameState['canvasMode']>[];
  browserContentModeOptions: CompactSelectOption<BrowserFrameState['contentMode']>[];
  fontOptions: CompactSelectOption<EditorToolSettings['text']['fontFamily']>[];
  shapeFillPalette: readonly string[];
  shapeStrokePalette: readonly string[];
  stepAlphabetOptions: CompactSelectOption<EditorToolSettings['step']['alphabet']>[];
  stepTypeOptions: CompactSelectOption<EditorToolSettings['step']['type']>[];
  textAlignOptions?: CompactSelectOption<EditorToolSettings['text']['textAlign']>[];
  textVerticalAlignOptions?: CompactSelectOption<EditorToolSettings['text']['verticalAlign']>[];
  textBackgroundPalette: readonly string[];
  textCalloutFormatOptions: CompactSelectOption<EditorToolSettings['text']['calloutFormat']>[];
  textColorPalette: readonly string[];
  textLayoutModeOptions?: CompactSelectOption<EditorToolSettings['text']['layoutMode']>[];
  workspaceColorError: string | null;
  workspaceColorMatchesDefault: boolean;
  workspaceDefaultSavePending: boolean;
  workspaceBackgroundPalette: readonly string[];
  gridPalette: readonly string[];
  gridSizeMin: number;
  gridSizeMax: number;
  clampGridSize: (value: number) => number;
  toNumber: (value: string, fallback?: number) => number;
  updateLockedDraft: (
    state: { width: number; height: number },
    field: 'width' | 'height',
    value: number,
    locked: boolean,
    aspectRatio: number | null
  ) => { width: number; height: number };
  setLayerSizeDraft: React.Dispatch<React.SetStateAction<{ width: number; height: number }>>;
  setLayerSizeLocked: React.Dispatch<React.SetStateAction<boolean>>;
  previewColor: (setter: (value: string) => void, color: string) => void;
  updateColor: (setter: (value: string) => void, color: string) => void;
  applyWorkspaceColor: (color: string) => Promise<void> | void;
  saveWorkspaceColorAsDefault: () => Promise<void> | void;
  applyPreset: (presetId: string) => void;
  setPencilShapeCorrection: (
    shapeCorrection: EditorToolSettings['pencil']['shapeCorrection']
  ) => void;
  saveShapeAsHighlighterPreset: () => Promise<void> | void;
  applyBrushPatch: (
    tool: 'pencil' | 'highlighter',
    patch: Partial<EditorToolSettings['pencil']>
  ) => void;
  applyShapePatch: (patch: Partial<EditorShapeSettings>) => void;
  applyBlurPatch: (patch: Partial<EditorToolSettings['blur']>) => void;
  applyArrowPatch: (patch: Partial<EditorToolSettings['arrow']>) => void;
  applyLinePatch?: (patch: Partial<EditorToolSettings['line']>) => void;
  applyTextPatch: (patch: Partial<EditorToolSettings['text']>) => void;
  applyTextStyle: EditorInspectorContentProps['applyTextStyle'];
  applyStepPatch: (patch: Partial<EditorToolSettings['step']>) => void;
  applyImagePatch?: ((patch: Partial<EditorToolSettings['image']>) => void) | undefined;
  applyRichShapePatch: EditorInspectorContentProps['applyRichShapePatch'];
  arrangeSelection: EditorInspectorContentProps['arrangeSelection'];
  previewBrushPatch: (
    tool: 'pencil' | 'highlighter',
    patch: Partial<EditorToolSettings['pencil']>
  ) => void;
  previewShapePatch: (patch: Partial<EditorShapeSettings>) => void;
  previewBlurPatch: (patch: Partial<EditorToolSettings['blur']>) => void;
  previewArrowPatch: (patch: Partial<EditorToolSettings['arrow']>) => void;
  previewLinePatch?: (patch: Partial<EditorToolSettings['line']>) => void;
  previewTextPatch: (patch: Partial<EditorToolSettings['text']>) => void;
  previewStepPatch: (patch: Partial<EditorToolSettings['step']>) => void;
  previewImagePatch?: ((patch: Partial<EditorToolSettings['image']>) => void) | undefined;
  commitPendingSelectionSettings: () => void;
  syncBrowserFrame: (updates: Partial<BrowserFrameState>) => Promise<void> | void;
  insertOrUpdateBrowserFrame?: () => Promise<void> | void;
  updateWorkspace: (patch: Partial<EditorWorkspaceSettings>) => void;
  layerEffectsState: EditorInspectorContentProps['layerEffectsState'];
  setLayerEffectsState: EditorInspectorContentProps['setLayerEffectsState'];
  onOpenLayerEffects: EditorInspectorContentProps['onOpenLayerEffects'];
  applyLayerEffect: EditorInspectorContentProps['applyLayerEffect'];
  updateLayerEffect: EditorInspectorContentProps['updateLayerEffect'];
  previewLayerEffect: EditorInspectorContentProps['previewLayerEffect'];
  resetLayerEffectPreview: EditorInspectorContentProps['resetLayerEffectPreview'];
  removeLayerEffect: EditorInspectorContentProps['removeLayerEffect'];
  applyLayerTransformation: EditorInspectorContentProps['applyLayerTransformation'];
  layers: EditorInspectorContentProps['layers'];
  onResizeLayer: EditorInspectorContentProps['onResizeLayer'];
}

export function renderEditorInspectorContentSurfaceSections(
  props: EditorInspectorContentSurfaceSectionsProps
) {
  if (props.inspector === 'layer-effects') {
    return (
      <EditorInspectorLayerEffectsPanel
        layers={props.layers}
        selection={props.selection}
        layerEffectsState={props.layerEffectsState}
        setLayerEffectsState={props.setLayerEffectsState}
        {...pickLayerEffectControlProps(props)}
      />
    );
  }

  if (props.inspector === 'browser-frame') {
    return (
      <EditorInspectorBrowserFramePanel
        browserFrame={props.browserFrame}
        browserCanvasModeOptions={props.browserCanvasModeOptions}
        browserContentModeOptions={props.browserContentModeOptions}
        syncBrowserFrame={props.syncBrowserFrame}
        {...(props.insertOrUpdateBrowserFrame === undefined
          ? {}
          : { insertOrUpdateBrowserFrame: props.insertOrUpdateBrowserFrame })}
      />
    );
  }

  if (props.inspector === 'workspace' || props.inspector === 'grid' || props.inspector === 'meta') {
    return renderEditorInspectorContentWorkspaceSections(props);
  }

  return renderEditorInspectorContentToolsSections(props);
}
