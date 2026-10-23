import { useEffect, useState, type ReactNode } from 'react';
import { ColorField, NumericRow, type NumericRowProps } from '../compact-inspector-controls';
import { InspectorParameterRow } from '../compact-inspector-controls/layout';
import { CompactSegmentedSelector } from '../compact-inspector-controls/control-renderers';
import { translate, useAppLocale } from '../../platform/i18n';
import type {
  ReviewKeyStyle,
  ReviewKeyPatch,
} from '../../features/video/project/action-feedback/key-animation';
import type { VideoActionKeyStyle } from '../../features/video/project/types';

interface KeyboardFeedbackFieldsProps {
  values: readonly ReviewKeyStyle[];
  part: 'display' | 'appearance' | 'timing' | 'position';
  disabled?: boolean | undefined;
  onChange(patch: ReviewKeyPatch): void;
}

/** Controlled command caption fields leave section navigation and project history with each runtime. */
export function KeyboardFeedbackFields(props: KeyboardFeedbackFieldsProps) {
  useAppLocale();
  if (!props.values.length) return null;
  const common = <T,>(values: readonly T[]) =>
    values.every((value) => value === values[0]) ? values[0] : undefined;
  const style = <K extends keyof VideoActionKeyStyle>(key: K) =>
    common(props.values.map((value) => value.style[key]));
  const change = (patch: ReviewKeyPatch) => {
    if (!props.disabled) props.onChange(patch);
  };
  const enabled = common(props.values.map((value) => value.enabled));
  const choice = <K extends 'position' | 'entrance' | 'fontFamily'>(
    key: K,
    values: readonly VideoActionKeyStyle[K][]
  ) => (
    <KeyChoice
      label={translate(KEY_CHOICE_LABELS[key])}
      value={style(key) ?? ''}
      options={values.map((value) => ({ value, label: translate(KEY_VALUE_LABELS[value]) }))}
      onChange={(value: VideoActionKeyStyle[K]) => change({ style: { [key]: value } })}
    />
  );
  return (
    <fieldset
      disabled={props.disabled}
      className="sniptale-parameter-stack min-w-0 space-y-2"
      data-ui={`shared.ui.keyboard-feedback.${props.part}`}
    >
      {props.part === 'display' ? (
        <>
          <KeyChoice
            label={translate('gallery.videoReview.keyDisplay')}
            value={enabled === undefined ? '' : enabled ? 'on' : 'off'}
            options={[
              { value: 'off', label: translate('gallery.videoReview.click_off') },
              { value: 'on', label: translate('gallery.videoReview.keyCaption') },
            ]}
            onChange={(value) => change({ enabled: value === 'on' })}
          />
          {props.values.some((value) => value.enabled)
            ? choice('entrance', ['none', 'fade', 'slide'])
            : null}
        </>
      ) : null}
      {props.part === 'appearance' ? (
        <KeyAppearance
          style={style}
          change={change}
          disabled={props.disabled ?? false}
          fontChoice={choice('fontFamily', ['sans-serif', 'serif', 'monospace'])}
        />
      ) : null}
      {props.part === 'timing'
        ? (['before', 'after', 'offset'] as const).map((key) => (
            <KeyNumber
              key={key}
              label={translate(`gallery.videoReview.key_${key}`)}
              value={common(props.values.map((value) => value[key] * 1000)) ?? null}
              min={key === 'offset' ? -2000 : key === 'after' ? 50 : 0}
              max={key === 'after' ? 5000 : 2000}
              scrub={{
                min: key === 'offset' ? -250 : 0,
                max: key === 'after' ? 2000 : 500,
                step: 10,
              }}
              step={10}
              precision={0}
              unit=""
              onCommitValue={(value) => change({ [key]: value / 1000 })}
            />
          ))
        : null}
      {props.part === 'position' ? (
        <>
          {choice('position', [
            'bottom-left',
            'bottom-center',
            'bottom-right',
            'top-left',
            'top-center',
            'top-right',
          ])}
          <KeyNumber
            label={translate('gallery.videoReview.key_margin')}
            value={style('margin') ?? null}
            min={0}
            max={160}
            scrub={{ min: 0, max: 80, step: 1 }}
            unit="px"
            step={1}
            precision={0}
            onCommitValue={(margin) => change({ style: { margin } })}
          />
        </>
      ) : null}
    </fieldset>
  );
}

function KeyAppearance({
  style,
  change,
  disabled,
  fontChoice,
}: {
  style<K extends keyof VideoActionKeyStyle>(key: K): VideoActionKeyStyle[K] | undefined;
  change(patch: ReviewKeyPatch): void;
  disabled: boolean;
  fontChoice: ReactNode;
}) {
  return (
    <>
      {fontChoice}
      {(['fontSize', 'cornerRadius'] as const).map((key) => (
        <KeyNumber
          key={key}
          label={translate(`gallery.videoReview.key_${key}`)}
          value={style(key) ?? null}
          min={key === 'fontSize' ? 12 : 0}
          max={key === 'fontSize' ? 96 : 32}
          scrub={{ min: key === 'fontSize' ? 12 : 0, max: key === 'fontSize' ? 48 : 32, step: 1 }}
          unit="px"
          step={1}
          precision={0}
          onCommitValue={(value) => change({ style: { [key]: value } })}
        />
      ))}
      {(['color', 'background'] as const).map((key) => (
        <div key={key} className="min-w-0">
          <ColorField
            label={translate(
              key === 'color' ? 'gallery.videoReview.keyColor' : 'gallery.videoReview.keyBackground'
            )}
            title={translate(
              key === 'color' ? 'gallery.videoReview.keyColor' : 'gallery.videoReview.keyBackground'
            )}
            value={style(key) ?? '#ffffff'}
            disabled={disabled}
            onChange={(value) => change({ style: { [key]: value, opacity: 1 } })}
          />
          {style(key) === undefined ? <KeyMixed /> : null}
        </div>
      ))}
      <KeyNumber
        label={translate('videoEditor.sidebar.actionOpacity')}
        value={style('opacity') === undefined ? null : style('opacity')! * 100}
        min={0}
        max={100}
        scrub={{ min: 0, max: 100, step: 1 }}
        unit="%"
        step={1}
        precision={0}
        onCommitValue={(value) => change({ style: { opacity: value / 100 } })}
      />
    </>
  );
}

const KEY_CHOICE_LABELS = {
  fontFamily: 'videoEditor.sidebar.keyFont',
  position: 'gallery.videoReview.keyPosition',
  entrance: 'gallery.videoReview.keyEntrance',
} as const;
const KEY_VALUE_LABELS = {
  'sans-serif': 'videoEditor.sidebar.keySans',
  serif: 'videoEditor.sidebar.keySerif',
  monospace: 'videoEditor.sidebar.keyMono',
  'bottom-left': 'gallery.videoReview.key_bottom-left',
  'bottom-center': 'gallery.videoReview.key_bottom-center',
  'bottom-right': 'gallery.videoReview.key_bottom-right',
  'top-left': 'gallery.videoReview.key_top-left',
  'top-center': 'gallery.videoReview.key_top-center',
  'top-right': 'gallery.videoReview.key_top-right',
  none: 'gallery.videoReview.key_none',
  fade: 'gallery.videoReview.key_fade',
  slide: 'gallery.videoReview.key_slide',
} as const;

function KeyChoice<T extends string>(props: {
  label: string;
  value: T | '';
  options: { value: T; label: string }[];
  onChange(value: T): void;
}) {
  return (
    <>
      <InspectorParameterRow
        label={props.label}
        valueOptions={props.options.map((option) => option.label)}
      >
        <CompactSegmentedSelector
          ariaLabel={props.label}
          value={props.value}
          columns={props.options.length > 2 ? 3 : 2}
          options={props.options}
          onChange={(value) => {
            const selected = props.options.find((option) => option.value === value);
            if (selected) props.onChange(selected.value);
          }}
        />
      </InspectorParameterRow>
      {props.value === '' ? <KeyMixed /> : null}
    </>
  );
}

function KeyMixed() {
  return (
    <p className="text-right text-xs italic text-[var(--sniptale-color-text-muted)]">
      {translate('gallery.videoReview.clickMixed')}
    </p>
  );
}

function KeyNumber(props: Omit<NumericRowProps, 'onPreviewValue'>) {
  const [draft, setDraft] = useState<number>();
  useEffect(() => setDraft(undefined), [props.value]);
  return (
    <>
      <NumericRow
        {...props}
        appearance="plain"
        focusAppearance="accent-box"
        enterBehavior="blur"
        className="min-h-8! w-full grid-cols-[minmax(0,1fr)_auto]! py-0!"
        value={draft ?? props.value}
        onPreviewValue={setDraft}
        onCommitValue={(value) => {
          setDraft(undefined);
          props.onCommitValue(value);
        }}
      />
      {props.value === null ? (
        <p className="text-right text-xs italic text-[var(--sniptale-color-text-muted)]">
          {translate('gallery.videoReview.clickMixed')}
        </p>
      ) : null}
    </>
  );
}
