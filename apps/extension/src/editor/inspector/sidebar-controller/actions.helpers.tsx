import type { Dispatch, SetStateAction } from 'react';
import type {
  BrowserFrameState,
  EditorFrameSettings,
} from '../../../features/editor/document/types';
import type { ImageEditorController } from '../../controller';
import { buildSidebarBackgroundActions } from './background';
import { buildSidebarColorActions } from './colors';
import { buildSidebarSaveActions } from './save';
import {
  GRID_COLOR_PALETTE,
  GRID_SIZE_MAX,
  GRID_SIZE_MIN,
  WORKSPACE_BACKGROUND_PALETTE,
  clampGridSize,
  getBrowserCanvasModeOptions,
  getBrowserContentModeOptions,
  getFrameBackgroundImageFitOptions,
  getFrameBackgroundModeOptions,
  getFrameGradientPresets,
  getFrameLayoutModeOptions,
  getLineStyleOptions,
  getStepAlphabetOptions,
  getStepTypeOptions,
  toNumber,
  updateLockedDraft,
} from '../sidebar-shared';
import type { SavePreset } from '../../../contracts/settings';
import type { EditorInspectorConfirmDialogState } from '../content/types';

export function createStaticSidebarOptions() {
  return {
    browserCanvasModeOptions: getBrowserCanvasModeOptions(),
    browserContentModeOptions: getBrowserContentModeOptions(),
    frameBackgroundImageFitOptions: getFrameBackgroundImageFitOptions(),
    frameBackgroundModeOptions: getFrameBackgroundModeOptions(),
    frameGradientPresets: getFrameGradientPresets(),
    frameLayoutModeOptions: getFrameLayoutModeOptions(),
    lineStyleOptions: getLineStyleOptions(),
    gridColorPalette: GRID_COLOR_PALETTE,
    gridPalette: GRID_COLOR_PALETTE,
    stepAlphabetOptions: getStepAlphabetOptions(),
    stepTypeOptions: getStepTypeOptions(),
    workspaceBackgroundPalette: WORKSPACE_BACKGROUND_PALETTE,
    clampGridSize,
    gridSizeMax: GRID_SIZE_MAX,
    gridSizeMin: GRID_SIZE_MIN,
  };
}

export function buildSidebarUtilityActions(args: {
  controller: Pick<
    ImageEditorController,
    'exportDocument' | 'renderToDataUrl' | 'withHistoryMuted'
  >;
  confirmOpenLibrary: (dialog: EditorInspectorConfirmDialogState) => Promise<boolean>;
  defaultImagePresetId: string | null;
  hasImage: boolean;
  rememberRecentColor: (color: string) => Promise<void>;
  savePresets: SavePreset[];
  setFrameDraft: Dispatch<SetStateAction<EditorFrameSettings>>;
  syncBrowserFrame: (updates: Partial<BrowserFrameState>) => Promise<void>;
}) {
  return {
    ...buildSidebarBackgroundActions(args),
    ...buildSidebarColorActions({
      rememberRecentColor: args.rememberRecentColor,
      withHistoryMuted: (callback) => args.controller.withHistoryMuted(callback),
    }),
    ...buildSidebarSaveActions(args),
    compactCommandGroups: [],
    setUniformPadding: (value: number) => {
      const padding = Math.max(0, Math.round(value));
      args.setFrameDraft((state) => ({
        ...state,
        paddingBottom: padding,
        paddingLeft: padding,
        paddingRight: padding,
        paddingTop: padding,
      }));
    },
    toNumber,
    updateLockedDraft,
  };
}
