import { Pipette, SquareSlash } from 'lucide-react';
import type { MouseEvent, PointerEvent } from 'react';
import { translate } from '../../platform/i18n';
import './picker.css';

const EYEDROPPER_ACTION_CLASS = [
  'inline-flex h-8 w-full cursor-pointer items-center justify-center rounded-[4px]',
  'bg-transparent text-[var(--sniptale-color-text-secondary)]',
  'hover:bg-[var(--sniptale-color-surface-hover)] focus-visible:outline-1',
  'focus-visible:outline-[var(--sniptale-color-text-secondary)]',
].join(' ');

const TRANSPARENT_ACTION_CLASS = [
  'flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[4px]',
  'text-[var(--sniptale-color-text-secondary)] hover:bg-[var(--sniptale-color-surface-hover)]',
  'focus-visible:outline-1 focus-visible:outline-[var(--sniptale-color-text-secondary)]',
].join(' ');

const RANGE_TRACK_CLASS = [
  'pointer-events-none absolute inset-x-[9px] h-3 overflow-hidden rounded-[3px]',
].join(' ');

export function PickerRange(props: {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (value: string) => void;
  background: string;
  checker?: boolean;
}) {
  return (
    <div className="relative flex h-8 min-w-0 items-center">
      <div className={`${RANGE_TRACK_CLASS} ${props.checker ? 'sniptale-picker-checker' : ''}`}>
        <div className="h-full w-full" style={{ background: props.background }} />
      </div>
      <input
        type="range"
        className="sniptale-picker-range"
        aria-label={props.label}
        min={props.min}
        max={props.max}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </div>
  );
}

function EyedropperActionButton(props: {
  eyedropperPressed: boolean;
  handleEyedropperPick: () => Promise<void>;
}) {
  const containPress = (event: MouseEvent<HTMLButtonElement> | PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();
  };
  return (
    <button
      type="button"
      aria-disabled={props.eyedropperPressed}
      aria-busy={props.eyedropperPressed}
      aria-label={translate('shared.ui.colorSelectorEyedropper')}
      title={translate('shared.ui.colorSelectorEyedropper')}
      data-pressed={props.eyedropperPressed ? 'true' : 'false'}
      data-sniptale-activation-bridge="defer"
      onPointerDown={containPress}
      onMouseDown={containPress}
      onClick={(event) => {
        containPress(event);
        if (!props.eyedropperPressed) queueMicrotask(() => void props.handleEyedropperPick());
      }}
      data-ui="shared.ui.color-selector.eyedropper"
      className={EYEDROPPER_ACTION_CLASS}
    >
      <Pipette aria-hidden="true" size={16} strokeWidth={1.75} />
    </button>
  );
}

export function PickerToolbar(props: {
  showTransparentAction?: boolean | undefined;
  allowTransparent?: boolean;
  eyedropperAvailable: boolean;
  eyedropperPressed: boolean;
  handleEyedropperPick: () => Promise<void>;
  hue: number;
  onHueChange: (nextHue: string) => void;
  onSelectTransparent: () => void;
  resolvedColor: string;
}) {
  return (
    <div
      data-ui="shared.ui.color-selector.hue"
      className="grid grid-cols-[minmax(0,1fr)_72px] items-center gap-3"
    >
      <PickerRange
        label={translate('shared.ui.colorSelectorChooseColor')}
        min={0}
        max={359}
        value={Math.round(props.hue)}
        onChange={props.onHueChange}
        background="linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)"
      />
      <div className="flex items-center justify-end gap-1">
        {props.showTransparentAction ? (
          <button
            type="button"
            aria-label={translate('shared.ui.colorSelectorTransparent')}
            title={translate('shared.ui.colorSelectorTransparent')}
            data-ui="shared.ui.color-selector.transparent"
            onClick={props.onSelectTransparent}
            className={TRANSPARENT_ACTION_CLASS}
          >
            <SquareSlash size={16} strokeWidth={1.75} />
          </button>
        ) : null}
        {props.eyedropperAvailable ? (
          <EyedropperActionButton
            eyedropperPressed={props.eyedropperPressed}
            handleEyedropperPick={props.handleEyedropperPick}
          />
        ) : null}
      </div>
    </div>
  );
}
