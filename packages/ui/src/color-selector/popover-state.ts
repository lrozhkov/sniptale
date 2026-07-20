import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import {
  hexToHsl,
  hexToRgb,
  hslToHex,
  normalizeColorSelectorValue,
  resolvePickerColor,
  updateRgbChannel,
} from './helpers';
import { getNextColorSelectorFormatMode, type ColorSelectorFormatMode } from './types';
export { usePickerColorState } from './picker-color-state';

type EyeDropperResult = { sRGBHex: string };
type EyeDropperCtor = new () => {
  open: (options?: { signal?: AbortSignal }) => Promise<EyeDropperResult>;
};

function getEyeDropperCtor(): EyeDropperCtor | null {
  return 'EyeDropper' in window ? (window['EyeDropper'] as EyeDropperCtor) : null;
}

function clearEyedropperSession(args: {
  abortControllerRef: MutableRefObject<AbortController | null>;
  eyedropperActiveRef: MutableRefObject<boolean>;
  onEyedropperStateChange: (active: boolean) => void;
  setEyedropperPressed: Dispatch<SetStateAction<boolean>>;
}) {
  args.eyedropperActiveRef.current = false;
  args.setEyedropperPressed(false);
  args.onEyedropperStateChange(false);
  args.abortControllerRef.current = null;
}

function startEyedropperSession(args: {
  abortControllerRef: MutableRefObject<AbortController | null>;
  eyedropperActiveRef: MutableRefObject<boolean>;
  eyedropperTokenRef: MutableRefObject<number>;
  onEyedropperStateChange: (active: boolean) => void;
  setEyedropperPressed: Dispatch<SetStateAction<boolean>>;
}) {
  const nextToken = args.eyedropperTokenRef.current + 1;
  const abortController = new AbortController();
  args.eyedropperTokenRef.current = nextToken;
  args.abortControllerRef.current?.abort();
  args.abortControllerRef.current = abortController;
  args.eyedropperActiveRef.current = true;
  args.setEyedropperPressed(true);
  args.onEyedropperStateChange(true);
  return {
    abortController,
    nextToken,
  };
}

function useEyedropperCleanup(args: {
  abortControllerRef: MutableRefObject<AbortController | null>;
  eyedropperActiveRef: MutableRefObject<boolean>;
  onEyedropperStateChange: (active: boolean) => void;
  setEyedropperPressed: Dispatch<SetStateAction<boolean>>;
}) {
  const { abortControllerRef, eyedropperActiveRef, onEyedropperStateChange, setEyedropperPressed } =
    args;

  useEffect(
    () => () => {
      abortControllerRef.current?.abort();
      if (eyedropperActiveRef.current) {
        clearEyedropperSession({
          abortControllerRef,
          eyedropperActiveRef,
          onEyedropperStateChange,
          setEyedropperPressed,
        });
      }
    },
    [abortControllerRef, eyedropperActiveRef, onEyedropperStateChange, setEyedropperPressed]
  );
}

async function runEyedropperPick(args: {
  abortControllerRef: MutableRefObject<AbortController | null>;
  eyedropperActiveRef: MutableRefObject<boolean>;
  eyedropperTokenRef: MutableRefObject<number>;
  onColorChange: (color: string) => void;
  onEyedropperStateChange: (active: boolean) => void;
  setEyedropperPressed: Dispatch<SetStateAction<boolean>>;
}) {
  const EyeDropperClass = getEyeDropperCtor();
  if (!EyeDropperClass) {
    return;
  }

  const { abortController, nextToken } = startEyedropperSession(args);

  try {
    const result = await new EyeDropperClass().open({ signal: abortController.signal });
    if (args.eyedropperTokenRef.current === nextToken) {
      args.onColorChange(resolvePickerColor(result.sRGBHex));
    }
  } catch {
    // User cancel keeps the picker state intact.
  } finally {
    if (args.eyedropperTokenRef.current === nextToken) {
      clearEyedropperSession(args);
    }
  }
}

export function useFormatMode() {
  const [formatMode, setFormatMode] = useState<ColorSelectorFormatMode>('hex');

  return {
    formatMode,
    cycleFormatMode: () => {
      setFormatMode((currentMode) => getNextColorSelectorFormatMode(currentMode));
    },
  };
}

export function useManualColorInput(color: string, onColorChange: (color: string) => void) {
  const resolvedColor = resolvePickerColor(color);
  const [manualColor, setManualColor] = useState(resolvedColor.toUpperCase());

  useEffect(() => {
    setManualColor(resolvedColor.toUpperCase());
  }, [resolvedColor]);

  return {
    manualColor,
    handleManualColorChange: (nextValue: string) => {
      setManualColor(nextValue);
      const normalized = normalizeColorSelectorValue(nextValue);
      if (normalized && normalized !== 'transparent') {
        onColorChange(normalized);
      }
    },
  };
}

function buildRgbColor(fields: { blue: string; green: string; red: string }) {
  let nextColor = '#000000';

  nextColor = updateRgbChannel(nextColor, 'red', fields.red) ?? '';
  nextColor = nextColor ? (updateRgbChannel(nextColor, 'green', fields.green) ?? '') : '';
  nextColor = nextColor ? (updateRgbChannel(nextColor, 'blue', fields.blue) ?? '') : '';

  return nextColor || null;
}

export function useRgbInputs(color: string, onColorChange: (color: string) => void) {
  const resolvedColor = resolvePickerColor(color);
  const [rgbFields, setRgbFields] = useState(() => {
    const rgbColor = hexToRgb(resolvedColor) ?? { red: 0, green: 0, blue: 0 };
    return {
      red: String(rgbColor.red),
      green: String(rgbColor.green),
      blue: String(rgbColor.blue),
    };
  });

  useEffect(() => {
    const rgbColor = hexToRgb(resolvedColor) ?? { red: 0, green: 0, blue: 0 };
    setRgbFields({
      red: String(rgbColor.red),
      green: String(rgbColor.green),
      blue: String(rgbColor.blue),
    });
  }, [resolvedColor]);

  const updateChannel = useCallback(
    (channel: keyof typeof rgbFields, nextValue: string) => {
      setRgbFields((currentFields) => {
        const nextFields = { ...currentFields, [channel]: nextValue };
        const nextColor = buildRgbColor(nextFields);
        if (nextColor) {
          onColorChange(nextColor);
        }

        return nextFields;
      });
    },
    [onColorChange]
  );

  return {
    rgbFields,
    handleRedChange: (nextValue: string) => updateChannel('red', nextValue),
    handleGreenChange: (nextValue: string) => updateChannel('green', nextValue),
    handleBlueChange: (nextValue: string) => updateChannel('blue', nextValue),
  };
}

function buildHslColor(fields: { hue: string; lightness: string; saturation: string }) {
  const hue = Number.parseInt(fields.hue.trim(), 10);
  const saturation = Number.parseInt(fields.saturation.trim(), 10);
  const lightness = Number.parseInt(fields.lightness.trim(), 10);

  if (!Number.isFinite(hue) || !Number.isFinite(saturation) || !Number.isFinite(lightness)) {
    return null;
  }

  return hslToHex({
    hue: Math.max(0, Math.min(359, hue)),
    saturation: Math.max(0, Math.min(100, saturation)),
    lightness: Math.max(0, Math.min(100, lightness)),
  });
}

export function useHslInputs(color: string, onColorChange: (color: string) => void) {
  const resolvedColor = resolvePickerColor(color);
  const [hslFields, setHslFields] = useState(() => {
    const hslColor = hexToHsl(resolvedColor) ?? { hue: 0, saturation: 0, lightness: 0 };
    return {
      hue: String(hslColor.hue),
      saturation: String(hslColor.saturation),
      lightness: String(hslColor.lightness),
    };
  });

  useEffect(() => {
    const hslColor = hexToHsl(resolvedColor) ?? { hue: 0, saturation: 0, lightness: 0 };
    setHslFields({
      hue: String(hslColor.hue),
      saturation: String(hslColor.saturation),
      lightness: String(hslColor.lightness),
    });
  }, [resolvedColor]);

  const updateChannel = useCallback(
    (channel: keyof typeof hslFields, nextValue: string) => {
      setHslFields((currentFields) => {
        const nextFields = { ...currentFields, [channel]: nextValue };
        const nextColor = buildHslColor(nextFields);
        if (nextColor) {
          onColorChange(nextColor);
        }

        return nextFields;
      });
    },
    [onColorChange]
  );

  return {
    hslFields,
    handleHueChange: (nextValue: string) => updateChannel('hue', nextValue),
    handleSaturationChange: (nextValue: string) => updateChannel('saturation', nextValue),
    handleLightnessChange: (nextValue: string) => updateChannel('lightness', nextValue),
  };
}

export function useEyedropper(
  onColorChange: (color: string) => void,
  onEyedropperStateChange: (active: boolean) => void
) {
  const abortControllerRef = useRef<AbortController | null>(null);
  const eyedropperActiveRef = useRef(false);
  const eyedropperTokenRef = useRef(0);
  const eyedropperAvailable = useMemo(() => getEyeDropperCtor() !== null, []);
  const [eyedropperPressed, setEyedropperPressed] = useState(false);
  useEyedropperCleanup({
    abortControllerRef,
    eyedropperActiveRef,
    onEyedropperStateChange,
    setEyedropperPressed,
  });

  const handleEyedropperPick = useCallback(async () => {
    await runEyedropperPick({
      abortControllerRef,
      eyedropperActiveRef,
      eyedropperTokenRef,
      onColorChange,
      onEyedropperStateChange,
      setEyedropperPressed,
    });
  }, [onColorChange, onEyedropperStateChange]);

  return {
    eyedropperAvailable,
    eyedropperPressed,
    handleEyedropperPick,
  };
}
