import { parseEffectV1Source, type ControlDefinition } from '@sniptale/runtime-contracts/effect-v1';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';

import type { VideoProjectEffectTarget } from '../../../../../features/video/project/effect-instance/types';
import type { VideoProject } from '../../../../../features/video/project/types';
import { getCurrentLocale, translate } from '../../../../../platform/i18n';
import { TextField } from '../../../../../ui/compact-inspector-controls';
import type { VideoProjectEffectInstancePatch } from '../../../../contracts/commands/patches';
import { NumberInput } from '../inputs/number';
import { ColorField, ToggleField } from '../shared/controls';

interface EffectInstanceGroupActions {
  onDeleteEffectInstance(instanceId: string): void;
  onDuplicateEffectInstance(instanceId: string): string | null;
  onMoveEffectInstance(instanceId: string, direction: 'down' | 'up'): void;
  onUpdateEffectInstance(instanceId: string, patch: VideoProjectEffectInstancePatch): void;
}

export function createEffectInstanceGroup(
  args: EffectInstanceGroupActions & {
    disabled?: boolean;
    instanceId?: string;
    project: VideoProject;
    target: VideoProjectEffectTarget;
  }
) {
  const instances = (args.project.effectInstances ?? []).filter((instance) =>
    args.instanceId ? instance.id === args.instanceId : sameTarget(instance.target, args.target)
  );
  return {
    content: (
      <div className="space-y-3">
        {instances.map((instance) => (
          <EffectInstanceCard {...args} instance={instance} key={instance.id} />
        ))}
      </div>
    ),
    id: 'effect-v1',
    label: translate('videoEditor.effectsLibrary.effectV1Label'),
    visible: instances.length > 0,
  } as const;
}

type EffectInstanceCardProps = EffectInstanceGroupActions & {
  disabled?: boolean;
  instance: NonNullable<VideoProject['effectInstances']>[number];
  project: VideoProject;
};

function EffectInstanceCard(props: EffectInstanceCardProps): React.JSX.Element {
  const { instance } = props;
  const snapshot = props.project.effectSnapshots?.find(({ id }) => id === instance.snapshotId);
  const validation = snapshot ? parseEffectV1Source(snapshot.source) : null;
  return (
    <section className="space-y-3 rounded-lg border p-3">
      <div>
        <p className="text-sm font-semibold">
          {validation?.document ? readLocaleText(validation.document.label) : instance.kind}
        </p>
        <p className="text-xs text-[var(--sniptale-color-text-muted)]">
          {snapshot?.documentId ?? instance.snapshotId}
        </p>
      </div>
      <ToggleField
        checked={instance.enabled}
        disabled={props.disabled ?? false}
        label={translate('videoEditor.effectsLibrary.controlEnabled')}
        onChange={(enabled) => props.onUpdateEffectInstance(instance.id, { enabled })}
      />
      <EffectInstanceStartTime {...props} />
      <EffectInstanceControls {...props} validation={validation} />
      <EffectInstanceActions {...props} />
    </section>
  );
}

function EffectInstanceStartTime(props: EffectInstanceCardProps): React.JSX.Element | null {
  if (props.instance.target.kind === 'transition' || props.instance.target.kind === 'scene') {
    return null;
  }
  return (
    <NumberInput
      disabled={props.disabled ?? false}
      label={translate('videoEditor.effectsLibrary.controlStartTime')}
      min={0}
      max={props.project.duration}
      step={0.05}
      unit="s"
      value={props.instance.startTime}
      onChange={(startTime) => props.onUpdateEffectInstance(props.instance.id, { startTime })}
    />
  );
}

function EffectInstanceControls(
  props: EffectInstanceCardProps & { validation: ReturnType<typeof parseEffectV1Source> | null }
): React.JSX.Element {
  if (!props.validation?.document) {
    return (
      <p role="alert" className="text-xs text-[var(--sniptale-color-danger)]">
        {translate('videoEditor.effectsLibrary.invalidSnapshot')}
      </p>
    );
  }
  return (
    <>
      {props.validation.document.controls.map((control) => (
        <EffectControl
          control={control}
          disabled={props.disabled ?? false}
          instanceId={props.instance.id}
          key={control.id}
          onUpdate={props.onUpdateEffectInstance}
          value={props.instance.controls[control.id] ?? control.defaultValue}
        />
      ))}
    </>
  );
}

function EffectInstanceActions(props: EffectInstanceCardProps): React.JSX.Element {
  return (
    <div className="flex flex-wrap gap-2">
      {props.instance.target.kind === 'clip' &&
        (['up', 'down'] as const).map((direction) => (
          <ProductActionButton
            compact
            disabled={props.disabled}
            key={direction}
            tone="secondary"
            onClick={() => props.onMoveEffectInstance(props.instance.id, direction)}
          >
            {translate(`videoEditor.effectsLibrary.${direction === 'up' ? 'moveUp' : 'moveDown'}`)}
          </ProductActionButton>
        ))}
      {props.instance.kind !== 'transition' ? (
        <ProductActionButton
          compact
          disabled={props.disabled}
          tone="secondary"
          onClick={() => props.onDuplicateEffectInstance(props.instance.id)}
        >
          {translate('videoEditor.effectsLibrary.duplicateInstance')}
        </ProductActionButton>
      ) : null}
      <ProductActionButton
        compact
        disabled={props.disabled}
        tone="danger"
        onClick={() => props.onDeleteEffectInstance(props.instance.id)}
      >
        {translate('videoEditor.effectsLibrary.deleteInstance')}
      </ProductActionButton>
    </div>
  );
}

function EffectControl(props: {
  control: ControlDefinition;
  disabled: boolean;
  instanceId: string;
  onUpdate(instanceId: string, patch: VideoProjectEffectInstancePatch): void;
  value: number | string;
}): React.JSX.Element {
  const label = readLocaleText(props.control.label) || props.control.id;
  const update = (value: number | string) =>
    props.onUpdate(props.instanceId, { controls: { [props.control.id]: value } });
  if (props.control.kind === 'number') {
    return (
      <NumberInput
        disabled={props.disabled}
        label={label}
        value={typeof props.value === 'number' ? props.value : props.control.defaultValue}
        onChange={update}
        {...(props.control.min === undefined ? {} : { min: props.control.min })}
        {...(props.control.max === undefined ? {} : { max: props.control.max })}
        {...(props.control.step === undefined ? {} : { step: props.control.step })}
      />
    );
  }
  if (props.control.kind === 'color') {
    return (
      <ColorField
        disabled={props.disabled}
        label={label}
        value={typeof props.value === 'string' ? props.value : props.control.defaultValue}
        onChange={update}
        onRememberRecentColor={undefined}
        recentColors={undefined}
      />
    );
  }
  const value = typeof props.value === 'string' ? props.value : props.control.defaultValue;
  return (
    <TextField
      defaultValue={value}
      disabled={props.disabled}
      key={`${props.instanceId}:${props.control.id}:${value}`}
      label={label}
      onValueCommit={update}
    />
  );
}

function readLocaleText(value: Record<string, string | undefined> | undefined): string {
  if (!value) return '';
  const locale = getCurrentLocale();
  return value[locale] ?? value['en'] ?? value['ru'] ?? '';
}

function sameTarget(left: VideoProjectEffectTarget, right: VideoProjectEffectTarget): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'scene') return true;
  if (left.kind === 'clip' && right.kind === 'clip') return left.clipId === right.clipId;
  return left.kind === 'transition' && right.kind === 'transition'
    ? left.transitionId === right.transitionId
    : false;
}
