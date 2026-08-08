import { useId, useRef, useState, type RefObject } from 'react';
import { serializePaintToCss, type GradientType, type Paint } from '@sniptale/foundation/paint';
import { usePaintSelectorState } from '@sniptale/ui/paint-selector/state';
import type { CompactPaintSelectorProps } from '@sniptale/ui/paint-selector/types';
import { FLOATING_INTERACTION_OWNER_ID_ATTRIBUTE } from '@sniptale/ui/floating-interactions/ownership';
import { useFormatMode } from '@sniptale/ui/color-selector/popover-state';
import { translate, useAppLocale } from '../../platform/i18n';
import { usePaintSelectorLifecycle } from './lifecycle';
import { usePaintModeState } from './mode-state';
import { PaintSelectorPortal } from './popup';
import type { GradientPresetActions, GradientPresetOption } from './preset-controls';

export type { GradientPresetActions, GradientPresetOption } from './preset-controls';

const createId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `paint-stop-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const TRIGGER_CLASS_NAME = [
  'flex h-9 w-full items-center gap-2 rounded-[8px]',
  'border border-[var(--sniptale-color-border-soft)] px-2 text-left text-xs',
].join(' ');

function gradientTypeLabel(type: GradientType): string {
  if (type === 'radial') return translate('highlighter.paintPicker.radial');
  if (type === 'conic') return translate('highlighter.paintPicker.conic');
  return translate('highlighter.paintPicker.linear');
}

function PaintSelectorTrigger(props: {
  buttonRef: RefObject<HTMLButtonElement | null>;
  disabled: boolean | undefined;
  draft: Paint;
  label: string;
  onClick: () => void;
  open: boolean;
}) {
  const stopCountLabel = translate('highlighter.paintPicker.stops');
  const summary =
    props.draft.kind === 'solid'
      ? props.draft.color.toUpperCase()
      : `${gradientTypeLabel(props.draft.gradient.type)} · ${props.draft.gradient.stops.length} ${stopCountLabel}`;
  return (
    <button
      ref={props.buttonRef}
      type="button"
      disabled={props.disabled}
      aria-label={props.label}
      aria-expanded={props.open}
      className={TRIGGER_CLASS_NAME}
      onClick={props.onClick}
    >
      <span
        className="h-5 w-7 shrink-0 rounded-[5px] border border-[var(--sniptale-color-border-soft)]"
        style={
          props.draft.kind === 'solid'
            ? { backgroundColor: props.draft.color }
            : { backgroundImage: serializePaintToCss(props.draft) }
        }
      />
      <span className="truncate">{summary}</span>
    </button>
  );
}

export function CompactPaintSelector(
  props: CompactPaintSelectorProps & {
    presetActions?: Omit<GradientPresetActions, 'onApply'>;
    presets?: readonly GradientPresetOption[];
  }
) {
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
        preview={state.preview}
        rootRef={rootRef}
        selectedStopId={state.selectedStopId}
        selectStop={state.setSelectedStopId}
        title={props.title}
        {...(props.presetActions ? { presetActions: props.presetActions } : {})}
        {...(props.presets ? { presets: props.presets } : {})}
      />
    </div>
  );
}
