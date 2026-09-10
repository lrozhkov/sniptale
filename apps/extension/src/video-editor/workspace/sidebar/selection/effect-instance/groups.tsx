import type { InspectorGroupDefinition } from '../grouped-inspector/types';
import { EffectVisualPresets } from './presets';
import { resolveEffectOwner } from '../../../../../features/video/project/effect-instance/owner';
import { InspectorDetails } from '../shared/details';
import { useEffectInstanceExport } from '../../../../runtime/effect-export';
import { getEffectControlSections, getEffectSequenceOptions } from './presentation';
import {
  parseEffectV1Source,
  resolveEffectLocaleText,
  type ControlDefinition,
} from '@sniptale/runtime-contracts/effect-v1';
import { ArrowUp, ArrowDown, Copy, Trash2, Download } from 'lucide-react';
import { EditorIconButton } from '@sniptale/ui/editor-chrome';

import type { VideoProjectEffectTarget } from '../../../../../features/video/project/effect-instance/types';
import type { VideoProject } from '../../../../../features/video/project/types';
import { getCurrentLocale, translate } from '../../../../../platform/i18n';
import { TextField } from '../../../../../ui/compact-inspector-controls';
import type { VideoProjectEffectInstancePatch } from '../../../../contracts/commands/patches';
import { NumberInput } from '../inputs/number';
import { ColorField, ToggleField, SelectInput } from '../shared/controls';

const EFFECT_ACTION_CLASS_NAME = [
  '!h-[var(--sniptale-compact-control-height,32px)]',
  '!w-[var(--sniptale-compact-control-height,32px)]',
].join(' ');

interface EffectInstanceGroupActions {
  onSetEffectTargetBypassed?: (target: VideoProjectEffectTarget, bypassed: boolean) => void;
  onSetClipEffectsBypassed?: (clipId: string, bypassed: boolean) => void;
  onDeleteEffectInstance(instanceId: string): void;
  onDuplicateEffectInstance(instanceId: string): string | null;
  onMoveEffectInstance(instanceId: string, direction: 'down' | 'up'): void;
  onUpdateEffectInstance(instanceId: string, patch: VideoProjectEffectInstancePatch): void;
}

export function createEffectInstanceGroup(
  args: EffectInstanceGroupActions & {
    disabled?: boolean;
    separateParameters?: boolean;
    instanceId?: string;
    project: VideoProject;
    target: VideoProjectEffectTarget;
  }
) {
  const instances = (args.project.effectInstances ?? []).filter((instance) =>
    args.instanceId ? instance.id === args.instanceId : sameTarget(instance.target, args.target)
  );
  const siblings = (args.project.effectInstances ?? []).filter((instance) =>
    sameTarget(instance.target, args.target)
  );
  return {
    content: (
      <div className="space-y-3">
        {instances.map((instance) => (
          <EffectInstanceCard
            {...args}
            parameterSection={args.separateParameters ? null : undefined}
            instance={instance}
            hideTitle={Boolean(args.instanceId)}
            key={instance.id}
            canMoveUp={siblings.indexOf(instance) > 0}
            canMoveDown={siblings.indexOf(instance) < siblings.length - 1}
          />
        ))}
      </div>
    ),
    defaultActive: Boolean(args.instanceId),
    id: 'effect-v1',
    semantic: 'effects' as const,
    label: translate('videoEditor.sidebar.inspectorGroupEffects'),
    visible: instances.length > 0,
  } as const;
}

export function createEffectInstanceGroups(
  args: Parameters<typeof createEffectInstanceGroup>[0]
): InspectorGroupDefinition<string>[] {
  const groups: InspectorGroupDefinition<string>[] = [
    createEffectInstanceGroup({ ...args, separateParameters: true }),
  ];
  const instances = (args.project.effectInstances ?? []).filter((instance) =>
    args.instanceId ? instance.id === args.instanceId : sameTarget(instance.target, args.target)
  );
  for (const instance of instances) {
    const snapshot = args.project.effectSnapshots?.find((item) => item.id === instance.snapshotId);
    const validation = snapshot ? parseEffectV1Source(snapshot.source) : null;
    if (!validation?.document) continue;
    for (const section of getEffectControlSections(validation.document)) {
      const id = `effect-controls-${section.id}`;
      const existing = groups.find((group) => group.id === id);
      const content = (
        <div key={instance.id} className="space-y-2">
          {instances.length > 1 && (
            <p className="text-xs font-medium">{readLocaleText(validation.document.label)}</p>
          )}
          <EffectInstanceControls
            {...args}
            instance={instance}
            validation={validation}
            parameterSection={section.id}
            hideTitle
            canMoveUp={false}
            canMoveDown={false}
          />
        </div>
      );
      if (existing)
        existing.content = (
          <>
            {existing.content}
            {content}
          </>
        );
      else groups.push({ id, semantic: section.semantic, label: section.label, content });
    }
  }
  const order = [
    'effects',
    'content',
    'typography',
    'appearance',
    'geometry',
    'processing',
    'animation',
    'advanced',
  ];
  return groups.sort((a, b) => order.indexOf(a.semantic) - order.indexOf(b.semantic));
}

type EffectInstanceCardProps = EffectInstanceGroupActions & {
  parameterSection?: string | null | undefined;
  hideTitle: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  disabled?: boolean;
  instance: NonNullable<VideoProject['effectInstances']>[number];
  project: VideoProject;
};

function EffectInstanceCard(props: EffectInstanceCardProps): React.JSX.Element {
  const { instance } = props;
  const snapshot = props.project.effectSnapshots?.find(({ id }) => id === instance.snapshotId);
  const validation = snapshot ? parseEffectV1Source(snapshot.source) : null;
  return (
    <section
      className="space-y-3 border-b border-[var(--sniptale-color-border-soft)] pb-3 last:border-b-0"
      data-effect-instance={instance.id}
    >
      {!props.hideTitle ? (
        <div>
          <p className="break-words text-[13px] font-semibold">
            {validation?.document
              ? readLocaleText(validation.document.label)
              : translate('videoEditor.effectsLibrary.unavailableEffect')}
          </p>
        </div>
      ) : null}
      <ToggleField
        checked={instance.enabled}
        disabled={props.disabled ?? false}
        label={translate('videoEditor.effectsLibrary.controlEnabled')}
        onChange={(enabled) => props.onUpdateEffectInstance(instance.id, { enabled })}
      />
      <EffectInstanceStartTime {...props} />
      {validation?.document && snapshot && (
        <EffectVisualPresets
          key={`${instance.id}:${snapshot.sha256}`}
          document={validation.document}
          sourceSha256={snapshot.sha256}
          controls={instance.controls}
          disabled={props.disabled ?? false}
          onChange={(controls) => props.onUpdateEffectInstance(instance.id, { controls })}
        />
      )}
      <EffectInstanceControls {...props} validation={validation} />
      <EffectInstanceActions {...props} />
    </section>
  );
}

function EffectInstanceStartTime(props: EffectInstanceCardProps): React.JSX.Element | null {
  if (props.instance.target.kind === 'transition' || props.instance.target.kind === 'scene') {
    return null;
  }
  const target = props.instance.target;
  const clip = resolveEffectOwner(props.project, target);
  if (!clip) return null;
  const owner = props.instance.rangeMode === 'owner';
  return (
    <div className="space-y-3">
      <SelectInput
        label={translate('videoEditor.effectsLibrary.fxScope')}
        disabled={props.disabled ?? false}
        value={owner ? 'owner' : 'interval'}
        options={[
          {
            value: 'owner',
            label: translate(
              target.kind === 'clip'
                ? 'videoEditor.effectsLibrary.wholeClip'
                : target.kind === 'track'
                  ? 'videoEditor.effectsLibrary.wholeTrack'
                  : 'videoEditor.effectsLibrary.wholeVideo'
            ),
          },
          { value: 'interval', label: translate('videoEditor.effectsLibrary.customInterval') },
        ]}
        onChange={(value) => {
          if (value === 'owner' || value === 'interval')
            props.onUpdateEffectInstance(props.instance.id, { rangeMode: value });
        }}
      />
      {!owner && (
        <>
          <NumberInput
            disabled={props.disabled ?? false}
            label={translate('videoEditor.effectsLibrary.controlStartTime')}
            min={clip.startTime}
            max={clip.startTime + clip.duration - props.instance.duration}
            step={1 / props.project.fps}
            unit="s"
            value={props.instance.startTime}
            onChange={(startTime) => props.onUpdateEffectInstance(props.instance.id, { startTime })}
          />
          <NumberInput
            disabled={props.disabled ?? false}
            label={translate('videoEditor.effectsLibrary.fxDuration')}
            min={1 / props.project.fps}
            max={clip.duration}
            step={1 / props.project.fps}
            unit="s"
            value={props.instance.duration}
            onChange={(duration) => props.onUpdateEffectInstance(props.instance.id, { duration })}
          />
        </>
      )}
      {(props.onSetEffectTargetBypassed || props.onSetClipEffectsBypassed) && (
        <ToggleField
          checked={clip.bypassed}
          disabled={props.disabled ?? false}
          label={translate('videoEditor.effectsLibrary.bypassOwner')}
          onChange={(value) =>
            props.onSetEffectTargetBypassed
              ? props.onSetEffectTargetBypassed(target, value)
              : target.kind === 'clip' && props.onSetClipEffectsBypassed?.(target.clipId, value)
          }
        />
      )}
    </div>
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
  const document = props.validation.document;
  const renderControl = (control: ControlDefinition) => (
    <EffectControl
      control={control}
      documentId={document.id}
      disabled={props.disabled ?? false}
      instanceId={props.instance.id}
      key={control.id}
      onUpdate={props.onUpdateEffectInstance}
      value={props.instance.controls[control.id] ?? control.defaultValue}
    />
  );
  return (
    <>
      {getEffectControlSections(document)
        .filter(
          (section) => props.parameterSection === undefined || section.id === props.parameterSection
        )
        .map((section, index) =>
          section.advanced ? (
            <InspectorDetails key={index} label={section.label}>
              {section.controls.map(renderControl)}
            </InspectorDetails>
          ) : (
            <div key={index} className="space-y-1">
              {section.label && props.parameterSection === undefined ? (
                <p className="pt-2 text-xs font-medium text-[var(--sniptale-color-text-secondary)]">
                  {section.label}
                </p>
              ) : null}
              {section.controls.map(renderControl)}
            </div>
          )
        )}
      {!props.parameterSection &&
        document.objectLayout?.handles?.map((handle) => {
          const point = props.instance.sceneAnchors?.[handle.id];
          if (!point) return null;
          return (
            <InspectorDetails key={handle.id} label={readLocaleText(handle.label)}>
              {(['x', 'y'] as const).map((axis) => (
                <NumberInput
                  key={axis}
                  label={`${readLocaleText(handle.label)} · ${axis.toUpperCase()}`}
                  value={point[axis]}
                  step={1}
                  unit="px"
                  disabled={props.disabled ?? false}
                  onChange={(value) =>
                    props.onUpdateEffectInstance(props.instance.id, {
                      sceneAnchors: {
                        ...props.instance.sceneAnchors,
                        [handle.id]: { ...point, [axis]: value },
                      },
                    })
                  }
                />
              ))}
            </InspectorDetails>
          );
        })}
    </>
  );
}

function EffectInstanceActions(props: EffectInstanceCardProps): React.JSX.Element {
  const download = useEffectInstanceExport(props.project, props.instance.id);
  return (
    <>
      {download.error ? (
        <p role="alert" className="text-xs text-[var(--sniptale-color-danger)]">
          {download.error}
        </p>
      ) : null}
      <div data-ui="video-editor.inspector.actions">
        {props.instance.kind === 'targetEffect' && (
          <>
            <EditorIconButton
              className={EFFECT_ACTION_CLASS_NAME}
              title={translate('videoEditor.effectsLibrary.moveUp')}
              disabled={props.disabled || !props.canMoveUp}
              onClick={() => props.onMoveEffectInstance(props.instance.id, 'up')}
            >
              <ArrowUp size={16} aria-hidden="true" />
            </EditorIconButton>
            <EditorIconButton
              className={EFFECT_ACTION_CLASS_NAME}
              title={translate('videoEditor.effectsLibrary.moveDown')}
              disabled={props.disabled || !props.canMoveDown}
              onClick={() => props.onMoveEffectInstance(props.instance.id, 'down')}
            >
              <ArrowDown size={16} aria-hidden="true" />
            </EditorIconButton>
          </>
        )}
        {props.instance.kind !== 'transition' && (
          <EditorIconButton
            className={EFFECT_ACTION_CLASS_NAME}
            title={translate('videoEditor.effectsLibrary.duplicateInstance')}
            disabled={props.disabled ?? false}
            onClick={() => props.onDuplicateEffectInstance(props.instance.id)}
          >
            <Copy size={16} aria-hidden="true" />
          </EditorIconButton>
        )}
        <EditorIconButton
          className={EFFECT_ACTION_CLASS_NAME}
          title={translate('videoEditor.effectsLibrary.exportInstance')}
          disabled={props.disabled || download.busy}
          onClick={() => {
            void download.export();
          }}
        >
          <Download size={16} aria-hidden="true" />
        </EditorIconButton>
        <span className="ml-1 border-l border-[var(--sniptale-color-border-soft)] pl-1">
          <EditorIconButton
            className={`${EFFECT_ACTION_CLASS_NAME} text-[var(--sniptale-color-danger)]`}
            title={translate('videoEditor.effectsLibrary.deleteInstance')}
            disabled={props.disabled ?? false}
            onClick={() => props.onDeleteEffectInstance(props.instance.id)}
          >
            <Trash2 size={16} aria-hidden="true" />
          </EditorIconButton>
        </span>
      </div>
    </>
  );
}

function EffectControl(props: {
  documentId: string;
  control: ControlDefinition;
  disabled: boolean;
  instanceId: string;
  onUpdate(instanceId: string, patch: VideoProjectEffectInstancePatch): void;
  value: number | string;
}): React.JSX.Element {
  const label = readLocaleText(props.control.label) || props.control.id;
  const update = (value: number | string) =>
    props.onUpdate(props.instanceId, { controls: { [props.control.id]: value } });
  const sequenceOptions = getEffectSequenceOptions(props.documentId, props.control);
  if (sequenceOptions)
    return (
      <SelectInput
        label={label}
        value={String(props.value)}
        options={sequenceOptions}
        disabled={props.disabled}
        onChange={(value) => update(props.control.kind === 'number' ? Number(value) : value)}
      />
    );
  if (props.control.kind === 'number') {
    return (
      <NumberInput
        disabled={props.disabled ?? false}
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
        className="border-transparent! bg-transparent! px-0! py-0!"
        disabled={props.disabled ?? false}
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
      className="!min-h-9 !bg-transparent !px-0 !py-0 data-[editing=false]:!border-transparent"
      defaultValue={value}
      disabled={props.disabled ?? false}
      key={`${props.instanceId}:${props.control.id}:${value}`}
      label={label}
      onValueCommit={update}
    />
  );
}

function readLocaleText(value: Record<string, string | undefined> | undefined): string {
  return resolveEffectLocaleText(value, getCurrentLocale());
}

function sameTarget(left: VideoProjectEffectTarget, right: VideoProjectEffectTarget): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'scene' || left.kind === 'video-group') return true;
  if (left.kind === 'track' && right.kind === 'track') return left.trackId === right.trackId;
  if (left.kind === 'clip' && right.kind === 'clip') return left.clipId === right.clipId;
  return left.kind === 'transition' && right.kind === 'transition'
    ? left.transitionId === right.transitionId
    : false;
}
