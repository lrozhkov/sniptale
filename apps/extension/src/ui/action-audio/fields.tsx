import { useEffect, useState } from 'react';
import { Play, RotateCcw } from 'lucide-react';
import { NumericRow, CheckboxField, ToggleField } from '../compact-inspector-controls';
import { translate, formatNumber, useAppLocale } from '../../platform/i18n';
import {
  REVIEW_ACTION_AUDIO_DEFAULT,
  reviewActionAudioRefKey,
  reviewActionAudioPresetFamily,
  isReviewActionAudioPreset,
  type ReviewActionAudioTarget,
  type ReviewActionAudioStyle,
  type ReviewActionAudioSetting,
  type ReviewActionAudioPatch,
  type ReviewActionAudioFamily,
} from '../../features/video/review/advanced/action-audio';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { CompactSegmentedSelector } from '../compact-inspector-controls/control-renderers';
import { InspectorParameterRow } from '../compact-inspector-controls/layout';

const PRESETS = {
  mouse: [
    'mouse-classic-v1',
    'mouse-alternate-v1',
    'mouse-soft-v1',
    'mouse-classic-paired-v2',
    'mouse-soft-paired-v2',
  ],
  keyboard: ['keyboard-v1', 'keyboard-recorded-v2'],
  typing: ['typing-natural-v1', 'typing-recorded-v2'],
} as const;
const FAMILY_LABELS = {
  mouse: 'gallery.videoReview.actionAudioMouse',
  keyboard: 'gallery.videoReview.actionAudioKeyboard',
  typing: 'gallery.videoReview.actionAudioTyping',
} as const;
const PRESET_LABELS = {
  'mouse-classic-v1': 'gallery.videoReview.actionAudioMouseClassic',
  'mouse-alternate-v1': 'gallery.videoReview.actionAudioMouseAlternate',
  'mouse-soft-v1': 'gallery.videoReview.actionAudioMouseSoft',
  'keyboard-v1': 'gallery.videoReview.actionAudioKeyboardNatural',
  'typing-natural-v1': 'gallery.videoReview.actionAudioTypingNatural',
  'mouse-classic-paired-v2': 'gallery.videoReview.actionAudioMousePaired',
  'mouse-soft-paired-v2': 'gallery.videoReview.actionAudioMouseSoftPaired',
  'keyboard-recorded-v2': 'gallery.videoReview.actionAudioRecorded',
  'typing-recorded-v2': 'gallery.videoReview.actionAudioRecorded',
} as const;

/** Family selectors preserve other families; common fields submit one functional batch. */
export function ActionAudioFields(props: {
  dataUi?: string;
  targets: readonly ReviewActionAudioTarget[];
  settings: readonly ReviewActionAudioSetting[];
  busy: boolean;
  onChange(targets: readonly ReviewActionAudioTarget[], patch: ReviewActionAudioPatch | null): void;
  onAudition?:
    | ((target: ReviewActionAudioTarget, style: ReviewActionAudioStyle) => void)
    | undefined;
  onStopAudition?: (() => void) | undefined;
}) {
  useAppLocale();
  const selectionKey = JSON.stringify(
    props.targets.map((target) => reviewActionAudioRefKey(target.ref))
  );
  const { onStopAudition } = props;
  useEffect(() => () => onStopAudition?.(), [selectionKey, onStopAudition]);
  if (!props.targets.length) return null;
  const settings = new Map(
    props.settings.map((setting) => [reviewActionAudioRefKey(setting.ref), setting])
  );
  const style = (target: ReviewActionAudioTarget): ReviewActionAudioStyle =>
    settings.get(reviewActionAudioRefKey(target.ref)) ?? REVIEW_ACTION_AUDIO_DEFAULT;
  const values = props.targets.map(style);
  const repeatTargets = props.targets.filter((target) => target.family !== 'mouse');
  const common = <T,>(values: readonly T[]) =>
    values.every((value) => value === values[0]) ? values[0] : undefined;
  return (
    <fieldset
      disabled={props.busy}
      className="min-w-0 sniptale-parameter-stack"
      data-ui={props.dataUi ?? 'gallery.videoReview.actionAudioFields'}
    >
      {(['mouse', 'keyboard', 'typing'] as const).map((family) => (
        <ActionAudioFamily key={family} family={family} props={props} style={style} />
      ))}
      {props.targets.some(
        (target) =>
          target.family === 'mouse' &&
          (style(target).presetId === 'mouse-classic-paired-v2' ||
            style(target).presetId === 'mouse-soft-paired-v2')
      )
        ? (['down', 'up'] as const).map((phase) => {
            const targets = props.targets.filter((target) => target.family === 'mouse');
            const enabledKey = phase === 'down' ? 'downEnabled' : 'upEnabled';
            const gainKey = phase === 'down' ? 'downGain' : 'upGain';
            const phaseEnabled = common(targets.map((target) => style(target)[enabledKey] ?? true));
            return (
              <div key={phase} className="space-y-1">
                <ActionAudioBoolean
                  count={targets.length}
                  label={translate(
                    phase === 'down'
                      ? 'gallery.videoReview.actionAudioDown'
                      : 'gallery.videoReview.actionAudioUp'
                  )}
                  value={phaseEnabled}
                  onChange={(enabled) => props.onChange(targets, { [enabledKey]: enabled })}
                />
                <ActionAudioNumber
                  disabled={props.busy}
                  field={gainKey}
                  value={common(targets.map((target) => style(target)[gainKey] ?? 1))}
                  onChange={(gain) => props.onChange(targets, { [gainKey]: gain })}
                />
              </div>
            );
          })
        : null}
      {props.targets.some(
        (target) =>
          style(target).presetId === 'keyboard-recorded-v2' ||
          style(target).presetId === 'typing-recorded-v2'
      ) ? (
        <ActionAudioBoolean
          count={repeatTargets.length}
          label={translate('gallery.videoReview.actionAudioRepeats')}
          value={common(repeatTargets.map((target) => style(target).includeRepeats === true))}
          onChange={(includeRepeats) => props.onChange(repeatTargets, { includeRepeats })}
        />
      ) : null}
      <ActionAudioNumber
        disabled={props.busy}
        field="volume"
        value={common(values.map((value) => value.volume))}
        onChange={(volume) => props.onChange(props.targets, { volume })}
      />
      <ActionAudioNumber
        disabled={props.busy}
        field="offset"
        value={common(values.map((value) => value.offset))}
        onChange={(offset) => props.onChange(props.targets, { offset })}
      />
      <ContentToolbarButton
        type="button"
        tone="outline"
        size="compact"
        className="flex w-full items-center justify-center gap-2"
        dataUi="gallery.videoReview.actionAudioReset"
        aria-label={translate('gallery.videoReview.actionAudioReset')}
        title={translate('gallery.videoReview.actionAudioReset')}
        onClick={() => props.onChange(props.targets, null)}
      >
        <RotateCcw size={14} aria-hidden="true" />
        {translate('gallery.videoReview.actionAudioReset')}
      </ContentToolbarButton>
    </fieldset>
  );
}

function ActionAudioBoolean(props: {
  count: number;
  label: string;
  value: boolean | undefined;
  onChange(value: boolean): void;
}) {
  return props.count > 1 ? (
    <CheckboxField
      label={props.label}
      value={props.value === true}
      indeterminate={props.value === undefined}
      onChange={props.onChange}
    />
  ) : (
    <ToggleField label={props.label} value={props.value === true} onChange={props.onChange} />
  );
}

function ActionAudioNumber(props: {
  disabled: boolean;
  field: 'volume' | 'offset' | 'downGain' | 'upGain';
  value: number | undefined;
  onChange(value: number): void;
}) {
  const [draft, setDraft] = useState<number>();
  useEffect(() => setDraft(undefined), [props.value]);
  const factor = props.field !== 'offset' ? 100 : 1;
  return (
    <NumericRow
      disabled={props.disabled}
      label={translate(
        props.field === 'downGain'
          ? 'gallery.videoReview.actionAudioDownGain'
          : props.field === 'upGain'
            ? 'gallery.videoReview.actionAudioUpGain'
            : props.field !== 'offset'
              ? 'gallery.videoReview.actionAudioVolume'
              : 'gallery.videoReview.actionAudioOffset'
      )}
      value={draft ?? (props.value === undefined ? null : props.value * factor)}
      min={props.field !== 'offset' ? 0 : -2}
      max={props.field !== 'offset' ? 100 : 2}
      step={props.field !== 'offset' ? 1 : 0.01}
      precision={props.field !== 'offset' ? 0 : 2}
      unit={props.field !== 'offset' ? '%' : 's'}
      scrub={{
        min: props.field !== 'offset' ? 0 : -2,
        max: props.field !== 'offset' ? 100 : 2,
        step: props.field !== 'offset' ? 1 : 0.01,
      }}
      enterBehavior="blur"
      onPreviewValue={setDraft}
      onCommitValue={(value) => {
        setDraft(undefined);
        props.onChange(value / factor);
      }}
    />
  );
}

function ActionAudioFamily({
  family,
  props,
  style,
}: {
  family: ReviewActionAudioFamily;
  props: Parameters<typeof ActionAudioFields>[0];
  style(target: ReviewActionAudioTarget): ReviewActionAudioStyle;
}) {
  const common = <T,>(values: readonly T[]) =>
    values.every((value) => value === values[0]) ? values[0] : undefined;
  const targets = props.targets.filter((target) => target.family === family);
  if (!targets.length) return null;
  const presetId = common(
    targets.map((target) => {
      const preset = style(target).enabled ? style(target).presetId : null;
      return preset && reviewActionAudioPresetFamily(preset) === family ? preset : null;
    })
  );
  const first = targets[0]!;
  return (
    <div key={family} className="space-y-1" data-family={family}>
      <InspectorParameterRow
        label={`${translate(FAMILY_LABELS[family])} · ${formatNumber(targets.length)}`}
      >
        <div className="flex min-w-0 items-center gap-1" data-audio-choice-row>
          <CompactSegmentedSelector
            columns={3}
            ariaLabel={`${translate(FAMILY_LABELS[family])} · ${formatNumber(targets.length)}`}
            value={presetId === undefined ? '' : (presetId ?? 'none')}
            options={[
              {
                disabled: props.busy,
                value: 'none',
                label: translate('gallery.videoReview.actionAudioNone'),
              },
              ...PRESETS[family].map((value) => ({
                value,
                disabled: props.busy,
                label: translate(PRESET_LABELS[value]),
              })),
            ]}
            onChange={(value: string) => {
              if (value === 'none') props.onChange(targets, { presetId: null });
              else if (
                isReviewActionAudioPreset(value) &&
                reviewActionAudioPresetFamily(value) === family
              )
                props.onChange(targets, { presetId: value });
            }}
          />
          <ContentToolbarButton
            type="button"
            tone="utility"
            size="compact"
            className="!h-8 !w-8 !min-w-8 shrink-0 !px-0"
            aria-label={translate('gallery.videoReview.actionAudioListen')}
            title={translate('gallery.videoReview.actionAudioListen')}
            disabled={props.busy || !props.onAudition || !presetId || style(first).volume <= 0}
            onClick={() => {
              if (presetId) props.onAudition?.(first, { ...style(first), enabled: true, presetId });
            }}
          >
            <Play size={14} aria-hidden="true" />
          </ContentToolbarButton>
        </div>
      </InspectorParameterRow>
      {presetId === undefined ? (
        <p className="text-right text-xs italic text-[var(--sniptale-color-text-muted)]">
          {translate('gallery.videoReview.clickMixed')}
        </p>
      ) : null}
    </div>
  );
}
