import { useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { VideoProject } from '../../../../../features/video/project/types/model';
import type { SourceAudioGainRange } from '../../../../../features/video/audio/source-envelope';
import type { VideoProjectSourceAudioDocument } from '../../../../../features/video/project/source-audio';
import {
  addProjectSourceAudioDocument,
  applyProjectSourceAudioEdit,
  isProjectSourceAudioEditable,
} from '../../../../../features/video/project/source-audio-authoring';
import { listProjectOriginalAudioTargets } from '../../../../../features/video/project/timeline/original-audio';
import { NumericRow, SegmentedRow } from '../../../../../ui/compact-inspector-controls';
import { translate, useAppLocale } from '../../../../../platform/i18n';
import { useVideoEditorTimelineEditingPort } from '../../../../runtime/controller/store';
import { InspectorActionButton } from '../shared/actions';
import { InspectorDetails } from '../shared/details';
import { SliderField } from '../shared/sliders';

type Binding = VideoProjectSourceAudioDocument['binding'];
const keyOf = (binding: Pick<Binding, 'assetId' | 'sourceInstanceId'>) =>
  JSON.stringify([binding.assetId, binding.sourceInstanceId]);

/** Native source selection is shared by Scene and selected audio inspectors. */
export function ProjectSourceAudioEditor({
  project,
  source,
}: {
  project: VideoProject;
  source?: Binding;
}) {
  useAppLocale();
  const [selected, setSelected] = useState('');
  const targets = [
    ...new Map(
      [
        ...listProjectOriginalAudioTargets(project),
        ...(project.sourceAudioDocuments ?? []).map((document) => document.binding),
      ].map((binding) => [keyOf(binding), binding])
    ).values(),
  ];
  const target = source ?? targets.find((binding) => keyOf(binding) === selected) ?? targets[0];
  if (!target) return null;
  const binding: Binding = {
    kind: 'source',
    assetId: target.assetId,
    sourceInstanceId: target.sourceInstanceId,
  };
  return (
    <div className="sniptale-parameter-stack min-w-0" data-ui="video-editor.source-audio">
      {!source ? (
        <SegmentedRow
          label={translate('videoEditor.sidebar.originalAudioSources')}
          ariaLabel={translate('videoEditor.sidebar.originalAudioSources')}
          value={keyOf(binding)}
          options={targets.map((target) => {
            const clip = project.clips.find(
              (clip) =>
                (clip.type === 'VIDEO' || clip.type === 'AUDIO') &&
                clip.assetId === target.assetId &&
                (clip.sourceInstanceId ?? clip.id) === target.sourceInstanceId
            );
            return {
              value: keyOf(target),
              label: [
                clip?.name ??
                  project.assets.find((asset) => asset.id === target.assetId)?.name ??
                  translate('videoEditor.sidebar.originalAudioMissingSource'),
                clip
                  ? `${project.tracks.find((track) => track.id === clip.trackId)?.name ?? ''} · ${clip.startTime} s`
                  : '',
              ]
                .filter(Boolean)
                .join(' · '),
            };
          })}
          onChange={setSelected}
        />
      ) : null}
      <SourceAudioDocumentEditor
        key={JSON.stringify([project.id, binding.assetId, binding.sourceInstanceId])}
        project={project}
        binding={binding}
      />
    </div>
  );
}

/** A source instance owns one editing lifetime, including rejected drafts and error feedback. */
function SourceAudioDocumentEditor({
  project,
  binding,
}: {
  project: VideoProject;
  binding: Binding;
}) {
  const [error, setError] = useState<'invalid' | 'stale' | 'locked' | null>(null);
  const updateProject = useVideoEditorTimelineEditingPort((port) => port.updateProject);
  const document = project.sourceAudioDocuments?.find(
    (document) => keyOf(document.binding) === keyOf(binding)
  );
  const disabled = !isProjectSourceAudioEditable(project, binding);
  const asset = project.assets.find((asset) => asset.id === binding.assetId);
  const placements = project.clips.filter(
    (clip) =>
      (clip.type === 'AUDIO' || clip.type === 'VIDEO') &&
      clip.assetId === binding.assetId &&
      (clip.sourceInstanceId ?? clip.id) === binding.sourceInstanceId
  );
  const duration =
    asset?.metadata.duration ??
    Math.max(
      0,
      ...placements.flatMap((clip) =>
        clip.type === 'AUDIO' || clip.type === 'VIDEO'
          ? [clip.sourceStart + clip.sourceDuration]
          : []
      )
    );
  const change = (ranges: SourceAudioGainRange[], mutes: SourceAudioGainRange[]) => {
    let reason: typeof error = 'stale';
    updateProject((current) => {
      if (current !== project) return current;
      const result = document
        ? applyProjectSourceAudioEdit(
            current,
            document,
            ranges.length || mutes.length ? { ranges, mutes } : null
          )
        : addProjectSourceAudioDocument(current, {
            id: crypto.randomUUID(),
            binding,
            ranges,
            mutes,
          });
      reason = result.ok ? null : result.reason;
      return result.ok ? result.project : current;
    });
    setError(reason);
    return reason === null;
  };
  const editRange = (
    branch: 'ranges' | 'mutes',
    id: string,
    patch: Partial<Pick<SourceAudioGainRange, 'start' | 'end' | 'volume'>> | null
  ) => {
    const ranges = document?.ranges ?? [],
      mutes = document?.mutes ?? [];
    const next = (branch === 'ranges' ? ranges : mutes).flatMap((range) =>
      range.id === id ? (patch ? [{ ...range, ...patch }] : []) : [range]
    );
    return change(branch === 'ranges' ? next : ranges, branch === 'mutes' ? next : mutes);
  };
  return (
    <>
      {(['ranges', 'mutes'] as const).map((branch) => (
        <SourceAudioRangeGroup
          key={branch}
          branch={branch}
          ranges={document?.[branch] ?? []}
          duration={duration}
          disabled={disabled}
          preferenceId={`source-audio:${project.id}:${document?.id}`}
          onEdit={(id, patch) => editRange(branch, id, patch)}
          onAdd={(gap) => {
            const next = [
              ...(document?.[branch] ?? []),
              { id: crypto.randomUUID(), ...gap, volume: branch === 'ranges' ? 1 : 0.25 },
            ];
            change(
              branch === 'ranges' ? next : (document?.ranges ?? []),
              branch === 'mutes' ? next : (document?.mutes ?? [])
            );
          }}
        />
      ))}
      {error ? (
        <p role="alert" className="text-xs text-[var(--sniptale-color-danger)]">
          {translate(
            error === 'invalid'
              ? 'videoEditor.sidebar.sourceAudioInvalid'
              : 'videoEditor.sidebar.sourceAudioStale'
          )}
        </p>
      ) : null}
    </>
  );
}

function SourceAudioRangeGroup({
  branch,
  ranges,
  duration,
  disabled,
  preferenceId,
  onAdd,
  onEdit,
}: {
  branch: 'ranges' | 'mutes';
  ranges: SourceAudioGainRange[];
  duration: number;
  disabled: boolean;
  preferenceId: string;
  onAdd(gap: { start: number; end: number }): void;
  onEdit(
    id: string,
    patch: Partial<Pick<SourceAudioGainRange, 'start' | 'end' | 'volume'>> | null
  ): boolean;
}) {
  const locale = useAppLocale();
  const time = new Intl.NumberFormat(locale, { maximumFractionDigits: 6 });
  const level = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 4 });
  const group = useRef<HTMLDivElement>(null);
  const gap =
    firstGap(ranges, duration) ??
    (branch === 'mutes' && Number.isFinite(duration) && duration >= 0.001
      ? { start: 0, end: duration }
      : null);
  const label = translate(
    branch === 'ranges'
      ? 'videoEditor.sidebar.sourceAudioGain'
      : 'videoEditor.sidebar.sourceAudioAttenuation'
  );
  return (
    <div ref={group} className="min-w-0 space-y-2">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="text-xs text-[var(--sniptale-color-text-secondary)]">{label}</span>
        <InspectorActionButton
          iconOnly
          data-source-audio-add
          title={translate('videoEditor.sidebar.sourceAudioAdd')}
          aria-label={`${translate('videoEditor.sidebar.sourceAudioAdd')}: ${label}`}
          disabled={disabled || !gap || ranges.length >= 512}
          onClick={() => {
            if (gap) onAdd(gap);
          }}
        >
          <Plus size={14} aria-hidden="true" />
        </InspectorActionButton>
      </div>
      {ranges.map((range) => (
        <InspectorDetails
          key={range.id}
          preferenceId={`${preferenceId}:${range.id}`}
          label={`${time.format(range.start)}–${time.format(range.end)} s · ${level.format(range.volume)}`}
        >
          <SourceTimeField
            key={`start:${range.end}`}
            label={translate('videoEditor.sidebar.sourceAudioStart')}
            value={range.start}
            min={0}
            max={86_400}
            step={0.001}
            precision={6}
            disabled={disabled}
            onChange={(start) => onEdit(range.id, { start })}
          />
          <SourceTimeField
            key={`end:${range.start}`}
            label={translate('videoEditor.sidebar.sourceAudioEnd')}
            value={range.end}
            min={0}
            max={86_400}
            step={0.001}
            precision={6}
            disabled={disabled}
            onChange={(end) => onEdit(range.id, { end })}
          />
          <SliderField
            label={translate('videoEditor.sidebar.sourceAudioLevel')}
            value={range.volume}
            min={0}
            max={branch === 'ranges' ? 2 : 1}
            step={0.01}
            precision={4}
            disabled={disabled}
            formatValue={(value) => `${value * 100}%`}
            onChange={(volume) => onEdit(range.id, { volume })}
          />
          <InspectorActionButton
            disabled={disabled}
            onClick={(event) => {
              const owner = event.currentTarget.ownerDocument;
              if (!onEdit(range.id, null)) return;
              requestAnimationFrame(() => {
                if (owner.activeElement === owner.body)
                  group.current
                    ?.querySelector<HTMLButtonElement>('[data-source-audio-add]')
                    ?.focus();
              });
            }}
          >
            <Trash2 size={14} aria-hidden="true" />
            {translate('videoEditor.sidebar.sourceAudioRemove')}
          </InspectorActionButton>
        </InspectorDetails>
      ))}
    </div>
  );
}

function firstGap(ranges: SourceAudioGainRange[], duration: number) {
  let start = 0;
  for (const range of [...ranges].sort((a, b) => a.start - b.start)) {
    if (Math.min(range.start, duration) - start >= 0.001)
      return { start, end: Math.min(range.start, duration) };
    start = Math.max(start, range.end);
  }
  return Number.isFinite(duration) && duration - start >= 0.001 ? { start, end: duration } : null;
}

/** Source seconds use an identity mapping to preserve directly entered values. */
function SourceTimeField(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  precision: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <NumericRow
      appearance="plain"
      enterBehavior="blur"
      focusAppearance="accent-box"
      label={props.label}
      value={props.value}
      unit="s"
      min={props.min}
      max={props.max}
      step={props.step}
      precision={props.precision}
      disabled={props.disabled}
      onPreviewValue={() => undefined}
      onCommitValue={props.onChange}
    />
  );
}
