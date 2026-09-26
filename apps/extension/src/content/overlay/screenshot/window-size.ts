import { getScreenshotSurfaceLeaseGeneration } from '../viewport-selector/capability';
import { useRef, useState } from 'react';
import type { ContentPrivilegedActionIntentSource } from '../../application/privileged-action-intent';
import type { ToolbarViewportSelection } from '../toolbar/types';
import { handleToolbarViewportChange } from '../toolbar/shell/viewport-change';

type Intent = ContentPrivilegedActionIntentSource | null | undefined;

/** Disposable size selection for one mounted screenshot controller. */
export interface ScreenshotWindowSizeControls {
  onlyDuringCapture: boolean;
  busy: boolean;
  selection: ToolbarViewportSelection;
  select: (selection: ToolbarViewportSelection, intent?: Intent) => Promise<void>;
  setOnlyDuringCapture: (
    value: boolean,
    current: ToolbarViewportSelection,
    intent?: Intent
  ) => Promise<void>;
}

export function useScreenshotWindowSize() {
  const [selection, setSelection] = useState<ToolbarViewportSelection>(null);
  const [onlyDuringCapture, setOnlyDuringCapture] = useState(false);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);

  const mutate = (viewport: ToolbarViewportSelection, intent?: Intent) =>
    handleToolbarViewportChange(viewport, () => undefined, undefined, intent);

  const select = async (next: ToolbarViewportSelection, intent?: Intent) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    try {
      if (onlyDuringCapture || (await mutate(next, intent))) setSelection(next);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };

  const changeTiming = async (
    value: boolean,
    current: ToolbarViewportSelection,
    intent?: Intent
  ) => {
    if (locked.current || value === onlyDuringCapture) return;
    locked.current = true;
    setBusy(true);
    try {
      const next = onlyDuringCapture ? selection : current;
      if (!(await mutate(value ? null : next, intent))) return;
      setSelection(next);
      setOnlyDuringCapture(value);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };

  const prepare = async (intent?: Intent): Promise<() => Promise<void>> => {
    if (locked.current) throw new Error('surface-busy');
    if (!onlyDuringCapture || !selection) return async () => {};
    locked.current = true;
    setBusy(true);
    let acquiredGeneration: number | null = null;
    const release = async () => {
      try {
        if (getScreenshotSurfaceLeaseGeneration() !== acquiredGeneration) return;
        if (!(await mutate(null))) throw new Error('Screenshot size restoration failed');
      } finally {
        locked.current = false;
        setBusy(false);
      }
    };
    try {
      if (!(await mutate(selection, intent))) throw new Error('Screenshot size preparation failed');
      acquiredGeneration = getScreenshotSurfaceLeaseGeneration();
      return release;
    } catch (error) {
      locked.current = false;
      setBusy(false);
      throw error;
    }
  };

  return {
    controls: { onlyDuringCapture, busy, selection, select, setOnlyDuringCapture: changeTiming },
    prepare,
  };
}
