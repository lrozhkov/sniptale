import { useId, useRef, useState } from 'react';
import { usePaintSelectorState } from '@sniptale/ui/paint-selector/state';
import type { CompactPaintSelectorProps } from '@sniptale/ui/paint-selector/types';
import { FLOATING_INTERACTION_OWNER_ID_ATTRIBUTE } from '@sniptale/ui/floating-interactions/ownership';
import { useFormatMode } from '@sniptale/ui/color-selector/popover-state';
import { useAppLocale } from '../../platform/i18n';
import { usePaintSelectorLifecycle } from './lifecycle';
import { usePaintModeState } from './mode-state';
import { PaintSelectorPortal } from './popup';
import { PaintSelectorTrigger } from './trigger';

const createId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `paint-stop-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function CompactPaintSelector(props: CompactPaintSelectorProps) {
  useAppLocale();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const ownerId = useId();
  const state = usePaintSelectorState({ ...props, createId });
  const format = useFormatMode();
  const [eyedropperActive, setEyedropperActive] = useState(false);
  const setMode = usePaintModeState({
    createId,
    draft: state.draft,
    externalValue: props.value,
    preview: state.preview,
    selectStop: state.setSelectedStopId,
  });
  usePaintSelectorLifecycle({
    cancel: state.cancel,
    disabled: props.disabled,
    eyedropperActive,
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
    >
      <PaintSelectorTrigger
        buttonRef={triggerRef}
        disabled={props.disabled}
        draft={state.draft}
        label={props.label}
        onClick={state.show}
        open={state.open}
      />
      <PaintSelectorPortal
        {...(props.allowedModes === undefined ? {} : { allowedModes: props.allowedModes })}
        apply={state.apply}
        cancel={state.cancel}
        createId={createId}
        draft={state.draft}
        formatMode={format.formatMode}
        layerRef={layerRef}
        onCycleFormatMode={format.cycleFormatMode}
        onEyedropperStateChange={setEyedropperActive}
        onModeChange={setMode}
        open={state.open}
        ownerId={ownerId}
        palette={props.palette ?? []}
        preview={state.preview}
        recentColors={props.recentColors ?? []}
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
