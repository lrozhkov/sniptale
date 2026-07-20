import { translate } from '../../../../../platform/i18n';
import type {
  VideoProjectActionPreset,
  VideoTemporalEasing,
} from '../../../../../features/video/project/types';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { TextField } from '../../../../../ui/compact-inspector-controls';
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

function ActionPresetSelect(props: {
  label?: string;
  onChange: (preset: VideoProjectActionPreset) => void;
  value: VideoProjectActionPreset;
}) {
  return (
    <SelectInput
      label={props.label}
      value={props.value}
      onChange={props.onChange}
      options={getActionPresetOptions()}
    />
  );
}

export function ActionPointFields(props: {
  actionEventId: string;
  point: { x: number; y: number };
  projectHeight: number;
  projectWidth: number;
  onUpdateActionEventDetails: ActionDetailsFieldsProps['onUpdateActionEventDetails'];
}) {
  return (
    <div className="space-y-3">
      <NumberInput
        label={translate('videoEditor.sidebar.actionPointXLabel')}
        value={props.point.x}
        min={0}
        max={props.projectWidth}
        step={1}
        onChange={(value) =>
          props.onUpdateActionEventDetails(props.actionEventId, {
            point: {
              x: value,
              y: props.point.y,
            },
          })
        }
      />
      <NumberInput
        label={translate('videoEditor.sidebar.actionPointYLabel')}
        value={props.point.y}
        min={0}
        max={props.projectHeight}
        step={1}
        onChange={(value) =>
          props.onUpdateActionEventDetails(props.actionEventId, {
            point: {
              x: props.point.x,
              y: value,
            },
          })
        }
      />
    </div>
  );
}

export function ActionPointButtons(props: {
  actionEventId: string;
  placementModeKind: ActionDetailsFieldsProps['placementModeKind'];
  projectHeight: number;
  projectWidth: number;
  onClearPlacementMode: () => void;
  onStartActionPointPlacement: (actionEventId: string) => void;
  onUpdateActionEventDetails: ActionDetailsFieldsProps['onUpdateActionEventDetails'];
}) {
  const isSelectingActionPoint =
    props.placementModeKind === VideoEditorPlacementModeKind.ACTION_POINT;

  return (
    <div className="space-y-2">
      <ProductActionButton
        compact
        tone="toggle"
        active={isSelectingActionPoint}
        aria-pressed={isSelectingActionPoint}
        onClick={() => props.onStartActionPointPlacement(props.actionEventId)}
      >
        {translate('videoEditor.sidebar.selectPointOnStage')}
      </ProductActionButton>
      <ProductActionButton
        compact
        tone="secondary"
        onClick={() => {
          props.onClearPlacementMode();
          props.onUpdateActionEventDetails(props.actionEventId, {
            point: {
              x: props.projectWidth / 2,
              y: props.projectHeight / 2,
            },
          });
        }}
      >
        {translate('videoEditor.sidebar.resetPointToCenter')}
      </ProductActionButton>
    </div>
  );
}

export function ActionPrimaryFields(props: {
  actionEventId: string;
  duration: number;
  label: string;
  preset: VideoProjectActionPreset;
  onUpdateActionEventDetails: ActionDetailsFieldsProps['onUpdateActionEventDetails'];
}) {
  return (
    <>
      <ActionPresetSelect
        label={translate('videoEditor.sidebar.actionPresetLabel')}
        value={props.preset}
        onChange={(preset) => props.onUpdateActionEventDetails(props.actionEventId, { preset })}
      />
      <SliderField
        label={translate('videoEditor.sidebar.actionTimePrefix')}
        value={props.duration}
        min={0}
        max={5}
        step={0.05}
        onChange={(value) =>
          props.onUpdateActionEventDetails(props.actionEventId, { duration: value })
        }
        formatValue={(value) => `${value.toFixed(2)} s`}
      />
      <TextField
        key={props.label}
        defaultValue={props.label}
        label={translate('videoEditor.sidebar.textLabel')}
        onValueCommit={(label) =>
          props.onUpdateActionEventDetails(props.actionEventId, {
            label,
          })
        }
      />
    </>
  );
}

export function DangerButton(props: { label: string; onClick: () => void; className?: string }) {
  return (
    <ProductActionButton compact tone="danger" onClick={props.onClick} className={props.className}>
      {props.label}
    </ProductActionButton>
  );
}

interface ActionDetailsFieldsProps {
  actionEventId: string;
  duration: number;
  label: string;
  point: { x: number; y: number } | null;
  projectHeight: number;
  projectWidth: number;
  preset: VideoProjectActionPreset;
  placementModeKind: VideoEditorPlacementMode['kind'] | null;
  onClearPlacementMode: () => void;
  onStartActionPointPlacement: (actionEventId: string) => void;
  onUpdateActionEventDetails: (
    actionEventId: string,
    patch: {
      duration?: number;
      label?: string;
      point?: { x: number; y: number } | null;
      preset?: VideoProjectActionPreset;
    }
  ) => void;
}

export function ActionDetailsFields(props: ActionDetailsFieldsProps) {
  const point = props.point ?? {
    x: props.projectWidth / 2,
    y: props.projectHeight / 2,
  };

  return (
    <div className="grid grid-cols-1 gap-3">
      <ActionPrimaryFields
        actionEventId={props.actionEventId}
        duration={props.duration}
        label={props.label}
        preset={props.preset}
        onUpdateActionEventDetails={props.onUpdateActionEventDetails}
      />
      <ActionPointFields
        actionEventId={props.actionEventId}
        point={point}
        projectHeight={props.projectHeight}
        projectWidth={props.projectWidth}
        onUpdateActionEventDetails={props.onUpdateActionEventDetails}
      />
      <ActionPointButtons
        actionEventId={props.actionEventId}
        placementModeKind={props.placementModeKind}
        projectHeight={props.projectHeight}
        projectWidth={props.projectWidth}
        onClearPlacementMode={props.onClearPlacementMode}
        onStartActionPointPlacement={props.onStartActionPointPlacement}
        onUpdateActionEventDetails={props.onUpdateActionEventDetails}
      />
    </div>
  );
}
