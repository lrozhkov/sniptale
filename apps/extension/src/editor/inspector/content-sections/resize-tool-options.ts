import type React from 'react';
import { translate } from '../../../platform/i18n';
import type { CompactSelectOption } from '../../chrome/ui';

type AspectFitSide = 'long' | 'short';
export type SizeDraft = { width: number; height: number };

const SIZE_PRESETS = [
  createSizePreset(3840, 2160),
  createSizePreset(1920, 1080),
  createSizePreset(1280, 720),
  createSizePreset(1080, 1080),
  createSizePreset(1080, 1920),
  createSizePreset(1200, 628),
  createSizePreset(1080, 1350),
  createSizePreset(1600, 900),
  createSizePreset(800, 600),
] satisfies Array<CompactSelectOption<string> & SizeDraft>;

const ASPECT_RATIO_PRESETS = [
  { value: '16:9', label: '16:9', ratio: 16 / 9 },
  { value: '9:16', label: '9:16', ratio: 9 / 16 },
  { value: '1:1', label: '1:1', ratio: 1 },
  { value: '4:3', label: '4:3', ratio: 4 / 3 },
  { value: '3:4', label: '3:4', ratio: 3 / 4 },
  { value: '3:2', label: '3:2', ratio: 3 / 2 },
  { value: '2:3', label: '2:3', ratio: 2 / 3 },
  { value: '4:5', label: '4:5', ratio: 4 / 5 },
  { value: '21:9', label: '21:9', ratio: 21 / 9 },
] satisfies Array<CompactSelectOption<string> & { ratio: number }>;

function createSizePreset(width: number, height: number): CompactSelectOption<string> & SizeDraft {
  return {
    height,
    label: `${width} x ${height}`,
    value: `${width}x${height}`,
    width,
  };
}

export function findPresetValue(draft: SizeDraft): string | null {
  return (
    SIZE_PRESETS.find((preset) => preset.width === draft.width && preset.height === draft.height)
      ?.value ?? null
  );
}

export function buildSizePresetOptions(currentValue: string): CompactSelectOption<string>[] {
  if (currentValue !== 'custom') {
    return SIZE_PRESETS;
  }

  return [
    { value: 'custom', label: translate('editor.compact.customSizePreset') },
    ...SIZE_PRESETS,
  ];
}

export function applySizePreset(
  setDraft: React.Dispatch<React.SetStateAction<SizeDraft>>,
  value: string
) {
  const preset = SIZE_PRESETS.find((item) => item.value === value);
  if (preset) {
    setDraft({ width: preset.width, height: preset.height });
  }
}

export function findAspectRatioValue(draft: SizeDraft): string | null {
  const ratio = draft.width / Math.max(1, draft.height);

  return (
    ASPECT_RATIO_PRESETS.find((preset) => Math.abs(preset.ratio - ratio) < 0.002)?.value ?? null
  );
}

export function buildAspectRatioOptions(currentValue: string): CompactSelectOption<string>[] {
  if (currentValue !== 'custom') {
    return ASPECT_RATIO_PRESETS;
  }

  return [
    { value: 'custom', label: translate('editor.compact.customSizePreset') },
    ...ASPECT_RATIO_PRESETS,
  ];
}

export function applySelectedAspectRatio(
  setDraft: React.Dispatch<React.SetStateAction<SizeDraft>>,
  value: string
) {
  const preset = ASPECT_RATIO_PRESETS.find((item) => item.value === value);
  if (preset) {
    setDraft((state) => fitSizeDraftToAspectRatio(state, preset.ratio, 'long'));
  }
}

export function applyCurrentAspectRatio(
  setDraft: React.Dispatch<React.SetStateAction<SizeDraft>>,
  value: string,
  side: AspectFitSide
) {
  const preset = ASPECT_RATIO_PRESETS.find((item) => item.value === value);
  if (preset) {
    setDraft((state) => fitSizeDraftToAspectRatio(state, preset.ratio, side));
  }
}

export function fitSizeDraftToAspectRatio(
  draft: SizeDraft,
  ratio: number,
  side: AspectFitSide
): SizeDraft {
  const safeRatio = Math.max(0.001, ratio);
  const width = Math.max(1, Math.round(draft.width));
  const height = Math.max(1, Math.round(draft.height));
  const preservedSide = side === 'long' ? Math.max(width, height) : Math.min(width, height);

  if (safeRatio >= 1) {
    return fitLandscapeAspectRatio(safeRatio, preservedSide, side);
  }

  return fitPortraitAspectRatio(safeRatio, preservedSide, side);
}

function fitLandscapeAspectRatio(
  ratio: number,
  preservedSide: number,
  side: AspectFitSide
): SizeDraft {
  if (side === 'long') {
    return { width: preservedSide, height: Math.max(1, Math.round(preservedSide / ratio)) };
  }

  return { width: Math.max(1, Math.round(preservedSide * ratio)), height: preservedSide };
}

function fitPortraitAspectRatio(
  ratio: number,
  preservedSide: number,
  side: AspectFitSide
): SizeDraft {
  if (side === 'long') {
    return { width: Math.max(1, Math.round(preservedSide * ratio)), height: preservedSide };
  }

  return { width: preservedSide, height: Math.max(1, Math.round(preservedSide / ratio)) };
}
