import type {
  BrowserFrameState,
  EditorWorkspaceSettings,
} from '../../../features/editor/document/types';

import { EditorInspectorBrowserFramePanel } from '../environment';
import type { CompactSelectOption } from '../../chrome/ui';
import { EditorInspectorLayerEffectsPanel } from '../layer-effects';
import { pickLayerEffectControlProps } from '../layer-effects/props';

import { renderEditorInspectorContentToolsSections } from './tools';
import { renderEditorInspectorContentWorkspaceSections } from './workspace';
import type { EditorInspectorContentProps } from '../content/types';
import type { EditorInspectorPresetHeaderState } from '../presets';
import type { EditorInspectorToolsPanelProps } from '../tools/types';

export interface EditorInspectorContentSurfaceSectionsProps extends Omit<
  EditorInspectorToolsPanelProps,
  'selectionDuplicateIcon' | 'selectionDeleteIcon'
> {
  inspector: string;
  scenePresetHeader: EditorInspectorPresetHeaderState | null;
  browserFrame: BrowserFrameState;
  workspace: EditorWorkspaceSettings;
  browserCanvasModeOptions: CompactSelectOption<BrowserFrameState['canvasMode']>[];
  browserContentModeOptions: CompactSelectOption<BrowserFrameState['contentMode']>[];
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
  applyWorkspaceColor: (color: string) => Promise<void> | void;
  saveWorkspaceColorAsDefault: () => Promise<void> | void;
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
