import { useCallback, useRef, useState } from 'react';
import { getPlaneColorFromHue, hexToHsv, hexToRgb, hsvToHex, resolvePickerColor } from './helpers';
import type { HsvColor } from './math';

type PickerDraftState = {
  hsvColor: HsvColor;
  resolvedColor: string;
};

export function usePickerColorState(color: string) {
  const [draftState, setDraftState] = useState(() =>
    buildPickerDraftState(resolvePickerColor(color))
  );
  const stickyHueRef = useRef(draftState.hsvColor.hue);

  const applyPickerDraft = useCallback(
    (nextHsvColor: HsvColor, options?: { rememberHue?: boolean; resolvedColor?: string }) => {
      const rememberedHue =
        options?.rememberHue === true ? clampHue(nextHsvColor.hue) : stickyHueRef.current;
      const normalizedHsvColor = normalizePickerDraft(nextHsvColor, rememberedHue);
      if (options?.rememberHue === true || isChromaticHsv(normalizedHsvColor)) {
        stickyHueRef.current = normalizedHsvColor.hue;
      }

      const resolvedColor = options?.resolvedColor ?? hsvToHex(normalizedHsvColor);
      setDraftState({ hsvColor: normalizedHsvColor, resolvedColor });
      return resolvedColor;
    },
    []
  );
  const pickerActions = usePickerDraftActions({
    applyPickerDraft,
    draftHsvColor: draftState.hsvColor,
  });

  return {
    ...pickerActions,
    hue: draftState.hsvColor.hue,
    planeColor: getPlaneColorFromHue(draftState.hsvColor.hue),
    resolvedColor: draftState.resolvedColor,
    rgbColor: hexToRgb(draftState.resolvedColor) ?? hexToRgb(resolvePickerColor(''))!,
    saturation: draftState.hsvColor.saturation,
    value: draftState.hsvColor.value,
  };
}

function usePickerDraftActions(args: {
  applyPickerDraft: (
    nextHsvColor: HsvColor,
    options?: { rememberHue?: boolean; resolvedColor?: string }
  ) => string;
  draftHsvColor: HsvColor;
}) {
  const { applyPickerDraft, draftHsvColor } = args;

  return {
    handleColorChange: useCallback(
      (nextColor: string) => {
        const resolvedColor = resolvePickerColor(nextColor);
        const nextHsvColor = hexToHsv(resolvedColor);
        if (!nextHsvColor) {
          return null;
        }

        return applyPickerDraft(nextHsvColor, { resolvedColor });
      },
      [applyPickerDraft]
    ),
    handleHueChange: useCallback(
      (nextHue: string) => {
        const parsedHue = Number.parseInt(nextHue.trim(), 10);
        if (!Number.isFinite(parsedHue)) {
          return null;
        }

        return applyPickerDraft({ ...draftHsvColor, hue: parsedHue }, { rememberHue: true });
      },
      [applyPickerDraft, draftHsvColor]
    ),
    handlePlaneSelectionChange: useCallback(
      (nextSelection: { saturation: number; value: number }) =>
        applyPickerDraft({ ...draftHsvColor, ...nextSelection }),
      [applyPickerDraft, draftHsvColor]
    ),
  };
}

function clampHue(value: number) {
  return Math.max(0, Math.min(359, Math.round(value)));
}

function clampUnit(value: number) {
  return Math.max(0, Math.min(1, value));
}

function isChromaticHsv(color: HsvColor) {
  return color.saturation > 0 && color.value > 0;
}

function normalizePickerDraft(color: HsvColor, stickyHue: number): HsvColor {
  const normalizedColor = {
    hue: clampHue(color.hue),
    saturation: clampUnit(color.saturation),
    value: clampUnit(color.value),
  };

  if (!isChromaticHsv(normalizedColor)) {
    return { ...normalizedColor, hue: stickyHue };
  }

  return normalizedColor;
}

function buildPickerDraftState(color: string): PickerDraftState {
  return {
    hsvColor: hexToHsv(color) ?? hexToHsv(resolvePickerColor(''))!,
    resolvedColor: color,
  };
}
