import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PAGE_TOOLBAR_CONTROLS,
  type ContentToolbarPreferences,
  type PageToolbarControl,
  type PageToolbarMode,
} from '../../../../contracts/settings';
import { loadSettings, patchSettings } from '../../../../composition/persistence/settings';
import { translate } from '../../../../platform/i18n';
import {
  createPageToolbarLayoutCommands,
  getPageToolbarLayout,
  hasPageToolbarCustomization,
} from './page-layout';

type Controls = NonNullable<ContentToolbarPreferences['pageControls']>;

const NAVIGATION_CONTROLS: readonly PageToolbarControl[] = [
  'auto-blur',
  'capture-visible',
  'capture-selection',
  'capture-full',
  'after-capture',
  'capture-delay',
  'capture-size',
  'quick-actions',
  'scenario-panel',
];
const MODE_CONTROL_PREFIX: Record<PageToolbarMode, string | null> = {
  cursor: null,
  drawing: 'drawing-',
  highlighter: 'annotation-',
  'quick-edit': 'editing-',
  'design-review': 'review-',
};

/** Owns persistent visibility and disposable customization for one mounted page toolbar. */
export function usePageToolbarControls(enabled: boolean, mode: PageToolbarMode = 'cursor') {
  const [controls, setControls] = useState<Controls>({});
  const [overrides, setOverrides] = useState<
    NonNullable<ContentToolbarPreferences['pageControlOverrides']>
  >({});
  const [layouts, setLayouts] = useState<NonNullable<ContentToolbarPreferences['pageLayouts']>>({});
  const [editing, setEditing] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const saving = useRef(false);
  const mounted = useRef(false);
  const reload = useCallback(async () => {
    const request = ++generation.current;
    setReady(false);
    setError(null);
    try {
      const settings = await loadSettings();
      if (request !== generation.current) return;
      setControls(settings.contentToolbar?.pageControls ?? {});
      setOverrides(settings.contentToolbar?.pageControlOverrides ?? {});
      setLayouts(settings.contentToolbar?.pageLayouts ?? {});
      setReady(true);
    } catch {
      if (request === generation.current) setError(translate('common.errors.loadFailed'));
    }
  }, []);
  useEffect(() => {
    mounted.current = enabled;
    setPending(saving.current);
    setEditing(false);
    setRevealed(false);
    if (enabled) void reload();
    return () => {
      mounted.current = false;
      generation.current += 1;
    };
  }, [enabled, reload]);
  useEffect(() => {
    if (!editing) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setEditing(false);
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [editing]);
  const setPreferences = async (
    patch: Pick<ContentToolbarPreferences, 'pageControls' | 'pageControlOverrides' | 'pageLayouts'>
  ) => {
    if (!enabled || !ready || saving.current) return;
    const request = generation.current;
    saving.current = true;
    setPending(true);
    setError(null);
    try {
      const settings = await patchSettings({
        contentToolbar: patch,
      });
      if (request === generation.current) {
        setControls(settings.contentToolbar?.pageControls ?? {});
        setOverrides(settings.contentToolbar?.pageControlOverrides ?? {});
        setLayouts(settings.contentToolbar?.pageLayouts ?? {});
      }
    } catch {
      if (request === generation.current) setError(translate('common.errors.saveFailed'));
    } finally {
      saving.current = false;
      if (mounted.current) {
        setPending(false);
        if (request !== generation.current) void reload();
      }
    }
  };
  const savedLayout = layouts[mode];
  const layout = useMemo(() => getPageToolbarLayout(mode, savedLayout), [mode, savedLayout]);
  const modeOverrides = mode === 'cursor' ? undefined : overrides[mode];
  const modePrefix = MODE_CONTROL_PREFIX[mode];
  const effectiveControls = { ...controls };
  for (const control of PAGE_TOOLBAR_CONTROLS) {
    const choice = modeOverrides?.[control];
    if (typeof choice === 'boolean') effectiveControls[control] = choice;
  }
  if (mode === 'drawing') effectiveControls['drawing-pencil'] = true;
  return {
    controls: effectiveControls,
    hasCustomization: hasPageToolbarCustomization({
      pageControls: controls,
      pageControlOverrides: overrides,
      pageLayouts: layouts,
    }),
    layout,
    layoutActive: enabled && ready && (editing || savedLayout != null),
    ...createPageToolbarLayoutCommands(layout, mode, setPreferences),
    mode,
    hasOverrides: NAVIGATION_CONTROLS.some(
      (control) => typeof modeOverrides?.[control] === 'boolean'
    ),
    hasHidden: PAGE_TOOLBAR_CONTROLS.some(
      (control) =>
        effectiveControls[control] === false &&
        (NAVIGATION_CONTROLS.includes(control) ||
          (modePrefix !== null && control.startsWith(modePrefix)))
    ),
    isOverridden: (control: PageToolbarControl) =>
      NAVIGATION_CONTROLS.includes(control) && typeof modeOverrides?.[control] === 'boolean',
    editing: enabled && editing,
    revealed: enabled && revealed,
    ready,
    pending,
    error,
    reload,
    setVisible: (control: PageToolbarControl, visible: boolean) =>
      mode === 'drawing' && control === 'drawing-pencil'
        ? Promise.resolve()
        : setPreferences(
            mode === 'cursor'
              ? { pageControls: { [control]: visible } }
              : { pageControlOverrides: { [mode]: { [control]: visible } } }
          ),
    resetOverrides: () =>
      mode === 'cursor'
        ? Promise.resolve()
        : setPreferences({
            pageControlOverrides: {
              [mode]: Object.fromEntries(NAVIGATION_CONTROLS.map((control) => [control, null])),
            },
          }),
    isVisible: (control: PageToolbarControl) =>
      !enabled || editing || revealed || effectiveControls[control] !== false,
    toggleEditing: () => {
      if (ready && (editing || !saving.current)) {
        setRevealed(false);
        setEditing((value) => !value);
      }
    },
    toggleRevealed: () => {
      setEditing(false);
      setRevealed((value) => !value);
    },
  };
}

export const PageToolbarControlsContext = createContext<ReturnType<
  typeof usePageToolbarControls
> | null>(null);
