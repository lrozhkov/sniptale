import './trigger.css';
import { useCallback, useId, useRef } from 'react';
import { usePaintSelectorState } from '@sniptale/ui/paint-selector/state';
import type { CompactPaintSelectorProps } from '@sniptale/ui/paint-selector/types';
import { FLOATING_INTERACTION_OWNER_ID_ATTRIBUTE } from '@sniptale/ui/floating-interactions/ownership';
import { useFormatMode } from '@sniptale/ui/color-selector/popover-state';
import { useAppLocale } from '../../platform/i18n';
import { usePaintSelectorLifecycle } from './lifecycle';
import { usePaintModeState, type PaintModeDrafts } from './mode-state';
import { PaintSelectorPortal } from './popup';
import { PaintSelectorTrigger } from './trigger';
import { createSolidPaint } from '@sniptale/foundation/paint';
import { usePickerPreferences } from '../../composition/picker-preferences/use-picker-preferences';
import { usePaintHistory } from './history';
import { useGradientPresetCatalog } from '../../composition/gradient-preset-resources/use-gradient-preset-catalog';

const createId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `paint-stop-${Date.now()}-${Math.random().toString(36).slice(2)}`;
function commitSelection(
  state: ReturnType<typeof usePaintSelectorState>,
  rememberColor: (color: string) => void
) {
  state.apply();
  const color =
    state.draft.kind === 'solid'
      ? state.draft.color
      : state.draft.gradient.stops.find((stop) => stop.id === state.selectedStopId)?.color;
  if (color) rememberColor(color);
}

function usePaintEditingSession(props: CompactPaintSelectorProps) {
  const state = usePaintSelectorState({ ...props, createId });
  const modeDrafts = useRef<PaintModeDrafts>({});
  const history = usePaintHistory({
    modeDrafts,
    draft: state.draft,
    open: state.open,
    selected: state.selectedStopId,
    preview: state.preview,
    select: state.setSelectedStopId,
  });
  const setMode = usePaintModeState({
    modeDrafts,
    createId,
    draft: state.draft,
    externalValue: props.value,
    open: state.open,
    preview: history.preview,
    selectStop: state.setSelectedStopId,
  });
  return { state, history, setMode };
}

export function CompactPaintSelector(props: CompactPaintSelectorProps) {
  useAppLocale();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const ownerId = useId();
  const resources = useGradientPresetCatalog('highlighter-frame-fill');
  const { state, history, setMode } = usePaintEditingSession(props);
  const preferences = usePickerPreferences(props.density);
  const format = useFormatMode();
  const eyedropperActiveRef = useRef(false);
  const setEyedropperActive = useCallback((active: boolean) => {
    eyedropperActiveRef.current = active;
  }, []);
  usePaintSelectorLifecycle({
    cancel: state.cancel,
    disabled: props.disabled,
    eyedropperActiveRef,
    layerRef,
    onOpenChange: props.onOpenChange,
    open: state.open,
    rootRef,
    triggerRef,
  });

  return (
    <div
      ref={rootRef}
      {...{ [FLOATING_INTERACTION_OWNER_ID_ATTRIBUTE]: ownerId }}
      tabIndex={-1}
      className={props.className ?? 'relative w-full min-w-0'}
      data-ui="shared.ui.paint-selector"
      data-trigger-variant={props.triggerVariant ?? 'default'}
    >
      <PaintSelectorTrigger
        variant={props.triggerVariant}
        buttonRef={triggerRef}
        disabled={props.disabled}
        draft={state.draft}
        label={props.label}
        onClick={state.open ? state.cancel : state.show}
        open={state.open}
        onCommitColor={(color) => props.onChange(createSolidPaint(color))}
      />
      <PaintSelectorPortal
        resources={resources}
        {...(props.allowedModes === undefined ? {} : { allowedModes: props.allowedModes })}
        apply={() => commitSelection(state, preferences.rememberColor)}
        cancel={state.cancel}
        createId={createId}
        draft={state.draft}
        original={props.value}
        catalogMode={preferences.catalogMode}
        onCatalogModeChange={preferences.setCatalogMode}
        compact={preferences.compact}
        onToggleCompact={() => preferences.setCompact(!preferences.compact)}
        history={history}
        formatMode={format.formatMode}
        layerRef={layerRef}
        onCycleFormatMode={format.cycleFormatMode}
        onEyedropperStateChange={setEyedropperActive}
        onModeChange={setMode}
        open={state.open}
        ownerId={ownerId}
        paletteNames={preferences.paletteNames}
        palette={props.palette ?? []}
        preview={history.preview}
        recentColors={props.recentColors ?? preferences.recentColors}
        {...(props.showGradientAdvancedControls === undefined
          ? {}
          : { showGradientAdvancedControls: props.showGradientAdvancedControls })}
        rootRef={rootRef}
        selectedStopId={state.selectedStopId}
        selectStop={state.setSelectedStopId}
        title={props.title}
      />
    </div>
  );
}
