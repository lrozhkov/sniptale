import type { Dispatch, SetStateAction } from 'react';
import type { BorderPreset } from '../../../features/highlighter/contracts';
import { projectBorderPresetToEditorShapeSettings } from '../../../features/editor/document/public';
import type {
  BrowserFrameState,
  EditorFrameSettings,
  EditorShapeSettings,
} from '../../../features/editor/document/types';
import type { EditorToolSettings } from '../../../features/editor/document/tool-settings-types';
import { createEditorFrameGradientPatch } from '../../../features/editor/document/frame-gradient';
import { assertEditorRasterImageFileCanBeRead } from '../../document/file-actions/raster-intake';
import type { getFrameGradientPresets } from '../sidebar-shared';
import { readFileAsDataUrl } from '../sidebar-shared';

interface SidebarBackgroundUtilityArgs {
  borderPresets: BorderPreset[];
  setFrameDraft: Dispatch<SetStateAction<EditorFrameSettings>>;
  syncBrowserFrame: (updates: Partial<BrowserFrameState>) => Promise<void>;
  targets: {
    preset?: (patch: {
      shape: Partial<EditorShapeSettings>;
      step: Partial<EditorToolSettings['step']>;
    }) => void;
    shape: (patch: Partial<EditorShapeSettings>) => void;
    step: (patch: Partial<EditorToolSettings['step']>) => void;
  };
}

function buildPresetPatch(preset: BorderPreset): Partial<EditorShapeSettings> {
  return projectBorderPresetToEditorShapeSettings(preset);
}

export function buildSidebarBackgroundActions(args: SidebarBackgroundUtilityArgs) {
  return {
    applyGradientPreset: (preset: ReturnType<typeof getFrameGradientPresets>[number]) => {
      args.setFrameDraft((state) => ({
        ...state,
        backgroundGradientAngle: preset.angle,
        ...createEditorFrameGradientPatch(state, [preset.from, preset.to]),
        backgroundMode: 'gradient',
      }));
    },
    applyPreset: (presetId: string) => {
      const preset = args.borderPresets.find((item) => item.id === presetId);
      if (!preset) {
        return;
      }

      const patch = {
        shape: buildPresetPatch(preset),
        step: { color: preset.color },
      };
      if (args.targets.preset) {
        args.targets.preset(patch);
        return;
      }

      args.targets.shape(patch.shape);
      args.targets.step(patch.step);
    },
    clearBackgroundImage: () => {
      args.setFrameDraft((state) => ({
        ...state,
        backgroundImageData: null,
      }));
    },
    handleBackgroundImageUpload: async (file: File | undefined) => {
      if (!file) {
        return;
      }

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
