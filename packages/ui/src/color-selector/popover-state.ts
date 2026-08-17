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

const activeEyedropperSessions = new Set<AbortController>();

export function isEyedropperSessionActive(): boolean {
  return activeEyedropperSessions.size > 0;
}

function getEyeDropperCtor(): EyeDropperCtor | null {
  if (typeof window === 'undefined') return null;
  const candidate: unknown = Reflect.get(window, 'EyeDropper');
  return typeof candidate === 'function' ? (candidate as EyeDropperCtor) : null;
}

function clearEyedropperSession(args: {
  abortControllerRef: MutableRefObject<AbortController | null>;
  eyedropperActiveRef: MutableRefObject<boolean>;
  onEyedropperStateChangeRef: MutableRefObject<(active: boolean) => void>;
  setEyedropperPressed: Dispatch<SetStateAction<boolean>>;
}) {
  if (args.abortControllerRef.current) {
    activeEyedropperSessions.delete(args.abortControllerRef.current);
  }
  args.eyedropperActiveRef.current = false;
  args.setEyedropperPressed(false);
  args.onEyedropperStateChangeRef.current(false);
  args.abortControllerRef.current = null;
}

function startEyedropperSession(args: {
  abortController: AbortController;
  eyedropperActiveRef: MutableRefObject<boolean>;
  eyedropperTokenRef: MutableRefObject<number>;
}) {
  const nextToken = args.eyedropperTokenRef.current + 1;
  args.eyedropperTokenRef.current = nextToken;
  args.eyedropperActiveRef.current = true;
  activeEyedropperSessions.add(args.abortController);
  return nextToken;
}

function publishEyedropperSession(args: {
  onEyedropperStateChangeRef: MutableRefObject<(active: boolean) => void>;
  setEyedropperPressed: Dispatch<SetStateAction<boolean>>;
}) {
  args.onEyedropperStateChangeRef.current(true);
  args.setEyedropperPressed(true);
}

function useEyedropperCleanup(args: {
  abortControllerRef: MutableRefObject<AbortController | null>;
  eyedropperActiveRef: MutableRefObject<boolean>;
  eyedropperTokenRef: MutableRefObject<number>;
  onEyedropperStateChangeRef: MutableRefObject<(active: boolean) => void>;
}) {
  const {
    abortControllerRef,
    eyedropperActiveRef,
    eyedropperTokenRef,
    onEyedropperStateChangeRef,
  } = args;

  useEffect(
    () => () => {
      eyedropperTokenRef.current += 1;
      // EyeDropper is a browser-owned interaction once open() succeeds. React owners may
      // legitimately rerender or unmount while Chrome is switching to that interaction;
      // aborting here makes the native cursor flash and immediately disappear.
      abortControllerRef.current = null;
      if (eyedropperActiveRef.current) {
        eyedropperActiveRef.current = false;
        onEyedropperStateChangeRef.current(false);
      }
    },
    [abortControllerRef, eyedropperActiveRef, eyedropperTokenRef, onEyedropperStateChangeRef]
  );
}

async function runEyedropperPick(args: {
  abortControllerRef: MutableRefObject<AbortController | null>;
  eyedropperActiveRef: MutableRefObject<boolean>;
  eyedropperTokenRef: MutableRefObject<number>;
  onColorChangeRef: MutableRefObject<(color: string) => void>;
  onEyedropperStateChangeRef: MutableRefObject<(active: boolean) => void>;
  setEyedropperPressed: Dispatch<SetStateAction<boolean>>;
}) {
  const EyeDropperClass = getEyeDropperCtor();
  if (!EyeDropperClass) {
    return;
  }
  if (args.eyedropperActiveRef.current) return;

  const abortController = new AbortController();
  args.abortControllerRef.current = abortController;
  const nextToken = startEyedropperSession({ ...args, abortController });
  let pick: Promise<EyeDropperResult>;
  try {
    pick = new EyeDropperClass().open({ signal: abortController.signal });
  } catch {
    if (args.eyedropperTokenRef.current === nextToken) {
      args.eyedropperActiveRef.current = false;
      activeEyedropperSessions.delete(abortController);
      args.abortControllerRef.current = null;
    }
    return;
  }
  publishEyedropperSession(args);

  try {
    const result = await pick;
    if (args.eyedropperTokenRef.current === nextToken) {
      args.onColorChangeRef.current(resolvePickerColor(result.sRGBHex));
    }
  } catch {
    // User cancel keeps the picker state intact.
  } finally {
    activeEyedropperSessions.delete(abortController);
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
  const onColorChangeRef = useRef(onColorChange);
  const onEyedropperStateChangeRef = useRef(onEyedropperStateChange);
  onColorChangeRef.current = onColorChange;
  onEyedropperStateChangeRef.current = onEyedropperStateChange;
  const eyedropperAvailable = useMemo(() => getEyeDropperCtor() !== null, []);
  const [eyedropperPressed, setEyedropperPressed] = useState(false);
  useEyedropperCleanup({
    abortControllerRef,
    eyedropperActiveRef,
    eyedropperTokenRef,
    onEyedropperStateChangeRef,
  });

  const handleEyedropperPick = useCallback(async () => {
    await runEyedropperPick({
      abortControllerRef,
      eyedropperActiveRef,
      eyedropperTokenRef,
      onColorChangeRef,
      onEyedropperStateChangeRef,
      setEyedropperPressed,
    });
  }, []);

  return {
    eyedropperAvailable,
    eyedropperPressed,
    handleEyedropperPick,
  };
}
