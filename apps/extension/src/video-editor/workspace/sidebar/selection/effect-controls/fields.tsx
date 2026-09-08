import { translate } from '../../../../../platform/i18n';
import type {
  VideoProjectActionPreset,
  VideoProjectActionPresentationOverride,
  VideoTemporalEasing,
} from '../../../../../features/video/project/types';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import {
  VideoEditorPlacementModeKind,
  type VideoEditorPlacementMode,
} from '../../../../contracts/placement';
import { NumberInput } from '../inputs/number';
import { SelectInput } from '../shared/controls';
import { SliderField } from '../shared/sliders';
import { getActionPresetOptions, getTemporalEasingOptions } from './options';

export function TemporalEasingSelect(props: {
  label?: string;
  onChange: (value: VideoTemporalEasing) => void;
  value: VideoTemporalEasing;
}) {
  return (
    <SelectInput
      label={props.label}
      value={props.value}
      onChange={props.onChange}
      options={getTemporalEasingOptions()}
    />
  );
}

export function ActionPrimaryFields(props: {
  part?: 'appearance' | 'animation';
  duration: number;
  offset: number;
  preset: VideoProjectActionPreset;
  showPreset?: boolean;
  disabled: boolean;
  onChange: (patch: VideoProjectActionPresentationOverride) => void;
}) {
  return (
    <div className="space-y-2">
      {props.part !== 'animation' && props.showPreset !== false && (
        <SelectInput
          label={translate('videoEditor.sidebar.actionPresetLabel')}
          value={props.preset}
          disabled={props.disabled}
          onChange={(preset) => props.onChange({ preset })}
          options={getActionPresetOptions()}
        />
      )}
      {props.part !== 'appearance' ? (
        <>
          <SliderField
            label={translate('videoEditor.sidebar.historyDuration')}
            value={props.duration}
            min={0.05}
            max={5}
            step={0.05}
            disabled={props.disabled}
            onChange={(duration) => props.onChange({ duration })}
            formatValue={(value) => `${value.toFixed(2)} s`}
          />
          <SliderField
            label={translate('videoEditor.sidebar.historyOffset')}
            value={props.offset}
            min={Math.min(-5, props.offset)}
            max={Math.max(5, props.offset)}
            step={0.05}
            disabled={props.disabled}
            onChange={(offset) => props.onChange({ offset })}
            formatValue={(value) => `${value.toFixed(2)} s`}
          />
        </>
      ) : null}
    </div>
  );
}

export function ActionPointFields(props: {
  point: { x: number; y: number };
  projectHeight: number;
  projectWidth: number;
  disabled: boolean;
  onChange: (patch: VideoProjectActionPresentationOverride) => void;
}) {
  return (
    <div className="space-y-2">
      <NumberInput
        label={translate('videoEditor.sidebar.actionPointXLabel')}
        value={props.point.x}
        min={0}
        max={props.projectWidth}
        step={1}
        disabled={props.disabled}
        onChange={(x) => props.onChange({ point: { ...props.point, x } })}
      />
      <NumberInput
        label={translate('videoEditor.sidebar.actionPointYLabel')}
        value={props.point.y}
        min={0}
        max={props.projectHeight}
        step={1}
        disabled={props.disabled}
        onChange={(y) => props.onChange({ point: { ...props.point, y } })}
      />
    </div>
  );
}

export function ActionPointButtons(props: {
  actionEventId: string;
  canvasDisabled?: boolean;
  placementModeKind: VideoEditorPlacementMode['kind'] | null;
  projectHeight: number;
  projectWidth: number;
  disabled: boolean;
  onClearPlacementMode: () => void;
  onStartActionPointPlacement: (actionEventId: string) => void;
  onChange: (patch: VideoProjectActionPresentationOverride) => void;
}) {
  const active = props.placementModeKind === VideoEditorPlacementModeKind.ACTION_POINT;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1">
      <ProductActionButton
        compact
        tone="toggle"
        active={active}
        aria-pressed={active}
        disabled={props.disabled || props.canvasDisabled}
        onClick={() => props.onStartActionPointPlacement(props.actionEventId)}
      >
        {translate('videoEditor.sidebar.selectPointOnStage')}
      </ProductActionButton>
      <ProductActionButton
        compact
        tone="secondary"
        disabled={props.disabled}
        onClick={() => {
          props.onClearPlacementMode();
          props.onChange({ point: { x: props.projectWidth / 2, y: props.projectHeight / 2 } });
        }}
      >
        {translate('videoEditor.sidebar.resetPointToCenter')}
      </ProductActionButton>
    </div>
  );
}

export function DangerButton(props: { label: string; onClick: () => void; className?: string }) {
  return (
    <ProductActionButton compact tone="danger" onClick={props.onClick} className={props.className}>
      {props.label}
    </ProductActionButton>
  );
}
