import type { Dispatch, SetStateAction } from 'react';
import type {
  BrowserFrameState,
  EditorFrameSettings,
} from '../../../features/editor/document/types';
import { createEditorFrameGradientPatch } from '../../../features/editor/document/frame-gradient';
import { readFileAsDataUrl } from '../../document/file-actions/file-reader';
import { assertEditorRasterImageFileCanBeRead } from '../../document/file-actions/raster-intake';
import type { getFrameGradientPresets } from '../sidebar-shared';

export function buildSidebarBackgroundActions(args: {
  setFrameDraft: Dispatch<SetStateAction<EditorFrameSettings>>;
  syncBrowserFrame: (updates: Partial<BrowserFrameState>) => Promise<void>;
}) {
  return {
    applyGradientPreset: (preset: ReturnType<typeof getFrameGradientPresets>[number]) => {
      args.setFrameDraft((state) => ({
        ...state,
        backgroundGradientAngle: preset.angle,
        ...createEditorFrameGradientPatch(state, [preset.from, preset.to]),
        backgroundMode: 'gradient',
      }));
    },
    clearBackgroundImage: () => {
      args.setFrameDraft((state) => ({ ...state, backgroundImageData: null }));
    },
    handleBackgroundImageUpload: async (file: File | undefined) => {
      if (!file) return;
      assertEditorRasterImageFileCanBeRead(file);
      const backgroundImageData = await readFileAsDataUrl(file);
      args.setFrameDraft((state) => ({
        ...state,
        backgroundImageData,
        backgroundMode: 'image',
      }));
    },
    syncBrowserFrame: (updates: Partial<BrowserFrameState>) => args.syncBrowserFrame(updates),
  };
}
