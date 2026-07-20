import { useRef, type CSSProperties } from 'react';
import { ChevronDown, ChevronUp, Link2 } from 'lucide-react';
import type { ContentSizeTooltipProps } from './types';
import {
  CONTENT_SIZE_TOOLTIP_ACTIONS_STYLE,
  CONTENT_SIZE_TOOLTIP_DIVIDER_STYLE,
  CONTENT_SIZE_TOOLTIP_STEPPER_CLASS_NAME,
  CONTENT_SIZE_TOOLTIP_STEPPER_CONTROLS_CLASS_NAME,
  CONTENT_SIZE_TOOLTIP_STEPPER_CONTROLS_STYLE,
  CONTENT_SIZE_TOOLTIP_STEPPER_STYLE,
  getContentSizeTooltipActionButtonStyle,
  getContentSizeTooltipRatioButtonStyle,
  getContentSizeTooltipStepButtonStyle,
} from './styles';
import { startContentSizeTooltipStepperRepeat } from './repeat';
import { TooltipSizeInput } from './input';

function addStepperReleaseListeners(stopRepeating: () => void): void {
  const stopRepeatingOnce = () => {
    stopRepeating();
    window.removeEventListener('mouseup', stopRepeatingOnce);
    window.removeEventListener('pointerup', stopRepeatingOnce);
    window.removeEventListener('pointercancel', stopRepeatingOnce);
  };
  window.addEventListener('mouseup', stopRepeatingOnce, { once: true });
  window.addEventListener('pointerup', stopRepeatingOnce, { once: true });
  window.addEventListener('pointercancel', stopRepeatingOnce, { once: true });
}

function TooltipStepperButton(props: {
  ariaLabel: string;
  className: string;
  disabled: boolean;
  onClick: () => void;
  rotated?: boolean;
}) {
  const suppressNextClickRef = useRef(false);

  return (
    <button
      type="button"
      aria-label={props.ariaLabel}
      className={`sniptale-size-btn ${props.className}`}
      title={props.ariaLabel}
      disabled={props.disabled}
      onMouseDown={(event) => {
        if (event.button !== 0 || props.disabled) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        suppressNextClickRef.current = true;
        props.onClick();
        const stopRepeating = startContentSizeTooltipStepperRepeat(props.onClick);
        addStepperReleaseListeners(stopRepeating);
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (suppressNextClickRef.current) {
          suppressNextClickRef.current = false;
          return;
        }

        if (!props.disabled) {
          props.onClick();
        }
      }}
      style={getContentSizeTooltipStepButtonStyle(props.disabled) as CSSProperties}
    >
      {props.rotated ? (
        <ChevronDown size={12} strokeWidth={2.3} />
      ) : (
        <ChevronUp size={12} strokeWidth={2.3} />
      )}
    </button>
  );
}

function TooltipStepperControls(props: {
  decreaseDisabled: boolean;
  decreaseLabel: string;
  increaseDisabled: boolean;
  increaseLabel: string;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <div
      className={CONTENT_SIZE_TOOLTIP_STEPPER_CONTROLS_CLASS_NAME}
      style={CONTENT_SIZE_TOOLTIP_STEPPER_CONTROLS_STYLE as CSSProperties}
    >
      <TooltipStepperButton
        ariaLabel={props.increaseLabel}
        className="sniptale-size-btn-plus"
        disabled={props.increaseDisabled}
        onClick={props.onIncrease}
      />
      <TooltipStepperButton
        ariaLabel={props.decreaseLabel}
        className="sniptale-size-btn-minus"
        disabled={props.decreaseDisabled}
        onClick={props.onDecrease}
        rotated
      />
    </div>
  );
}

function TooltipStepper(props: {
  decreaseLabel: string;
  fieldLabel: string;
  increaseLabel: string;
  max: number;
  min: number;
  onCommit: (value: number) => void;
  onDecrease: () => void;
  onIncrease: () => void;
  onRawChange: (value: number) => void;
  value: number;
}) {
  const roundedValue = Math.round(props.value);

  return (
    <div
      className={CONTENT_SIZE_TOOLTIP_STEPPER_CLASS_NAME}
      style={CONTENT_SIZE_TOOLTIP_STEPPER_STYLE as CSSProperties}
    >
      <TooltipSizeInput
        ariaLabel={props.fieldLabel}
        max={props.max}
        min={props.min}
        onCommit={props.onCommit}
        onRawChange={props.onRawChange}
        value={props.value}
      />
      <TooltipStepperControls
        decreaseDisabled={roundedValue <= props.min}
        decreaseLabel={props.decreaseLabel}
        increaseDisabled={roundedValue >= props.max}
        increaseLabel={props.increaseLabel}
        onDecrease={props.onDecrease}
        onIncrease={props.onIncrease}
      />
    </div>
  );
}

function TooltipDivider() {
  return <span aria-hidden="true" style={CONTENT_SIZE_TOOLTIP_DIVIDER_STYLE as CSSProperties} />;
}

function TooltipAspectRatioButton(props: {
  active: boolean;
  canToggle: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      aria-pressed={props.canToggle ? props.active : undefined}
      disabled={!props.canToggle}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (props.canToggle) {
          props.onToggle();
        }
      }}
      style={
        getContentSizeTooltipRatioButtonStyle({
          active: props.active,
          disabled: !props.canToggle,
        }) as CSSProperties
      }
    >
      <Link2 style={{ width: 14, height: 14 }} />
    </button>
  );
}

function TooltipActions(props: Pick<ContentSizeTooltipProps, 'copy' | 'onCancel' | 'onConfirm'>) {
  return (
    <div style={CONTENT_SIZE_TOOLTIP_ACTIONS_STYLE as CSSProperties}>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          props.onCancel();
        }}
        style={getContentSizeTooltipActionButtonStyle('neutral') as CSSProperties}
      >
        {props.copy.cancel}
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          props.onConfirm();
        }}
        style={getContentSizeTooltipActionButtonStyle('accent') as CSSProperties}
      >
        {props.copy.confirm}
      </button>
    </div>
  );
}

export function ContentSizeTooltipContent(
  props: ContentSizeTooltipProps & { canToggleAspectRatio: boolean }
) {
  return (
    <>
      <TooltipStepper
        decreaseLabel={props.copy.decreaseWidth}
        fieldLabel={props.copy.widthField}
        increaseLabel={props.copy.increaseWidth}
        max={props.widthMax}
        min={props.widthMin}
        onCommit={props.onWidthChangeCommit}
        onDecrease={props.onWidthDecrease}
        onIncrease={props.onWidthIncrease}
        onRawChange={props.onWidthChangeRaw}
        value={props.widthValue}
      />
      <TooltipAspectRatioButton
        active={props.maintainAspectRatio}
        canToggle={props.canToggleAspectRatio}
        label={props.copy.keepAspectRatio}
        onToggle={props.onToggleAspectRatio}
      />
      <TooltipStepper
        decreaseLabel={props.copy.decreaseHeight}
        fieldLabel={props.copy.heightField}
        increaseLabel={props.copy.increaseHeight}
        max={props.heightMax}
        min={props.heightMin}
        onCommit={props.onHeightChangeCommit}
        onDecrease={props.onHeightDecrease}
        onIncrease={props.onHeightIncrease}
        onRawChange={props.onHeightChangeRaw}
        value={props.heightValue}
      />
      <TooltipDivider />
      <TooltipActions copy={props.copy} onCancel={props.onCancel} onConfirm={props.onConfirm} />
    </>
  );
}
