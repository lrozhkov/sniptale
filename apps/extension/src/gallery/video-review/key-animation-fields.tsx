import { useEffect, useState } from 'react';
import {
  ColorField,
  NumericRow,
  SelectField,
  type NumericRowProps,
} from '../../ui/compact-inspector-controls';
import { translate } from '../../platform/i18n';
import type {
  ReviewKeyStyle,
  ReviewKeyPatch,
} from '../../features/video/review/advanced/key-animation';
import type { VideoActionKeyStyle } from '../../features/video/project/types';
import { ReviewButton, reviewSelectFieldClassName, reviewTextButtonClassName } from './controls';

/** Single and batch fields commit only the edited property. */
export function ReviewKeyFields(props: {
  values: readonly ReviewKeyStyle[];
  onChange(patch: ReviewKeyPatch | null): void;
}) {
  const common = <T,>(values: readonly T[]) =>
    values.every((value) => value === values[0]) ? values[0] : undefined;
  const enabled = common(props.values.map((value) => value.enabled));
  const style = <K extends keyof VideoActionKeyStyle>(key: K) =>
    common(props.values.map((value) => value.style[key]));
  const select = <K extends 'position' | 'entrance'>(
    key: K,
    values: readonly VideoActionKeyStyle[K][]
  ) => (
    <SelectField
      className={reviewSelectFieldClassName}
      label={translate(
        key === 'position' ? 'gallery.videoReview.keyPosition' : 'gallery.videoReview.keyEntrance'
      )}
      value={style(key) ?? ''}
      options={values.map((value) => ({
        value,
        label: translate(`gallery.videoReview.key_${value}`),
      }))}
      onChange={(value: VideoActionKeyStyle[K]) => props.onChange({ style: { [key]: value } })}
    />
  );
  return (
    <div className="space-y-3" data-ui="gallery.videoReview.keyFields">
      <SelectField
        className={reviewSelectFieldClassName}
        label={translate('gallery.videoReview.keyDisplay')}
        value={enabled === undefined ? '' : enabled ? 'on' : 'off'}
        options={[
          { value: 'off', label: translate('gallery.videoReview.click_off') },
          { value: 'on', label: translate('gallery.videoReview.keyCaption') },
        ]}
        onChange={(value) => props.onChange({ enabled: value === 'on' })}
      />
      {props.values.some((value) => value.enabled) ? (
        <>
          {select('position', [
            'bottom-left',
            'bottom-center',
            'bottom-right',
            'top-left',
            'top-center',
            'top-right',
          ])}
          {select('entrance', ['none', 'fade', 'slide'])}
          {(['fontSize', 'cornerRadius', 'margin'] as const).map((key) => (
            <KeyNumber
              key={key}
              label={translate(`gallery.videoReview.key_${key}`)}
              value={style(key) ?? null}
              min={key === 'fontSize' ? 12 : 0}
              max={key === 'fontSize' ? 96 : key === 'margin' ? 160 : 32}
              scrub={{
                min: key === 'fontSize' ? 12 : 0,
                max: key === 'fontSize' ? 48 : key === 'margin' ? 80 : 32,
                step: 1,
              }}
              unit="px"
              step={1}
              precision={0}
              onCommitValue={(value) => props.onChange({ style: { [key]: value } })}
            />
          ))}
          {(['color', 'background'] as const).map((key) => (
            <ColorField
              key={key}
              label={translate(
                key === 'color'
                  ? 'gallery.videoReview.keyColor'
                  : 'gallery.videoReview.keyBackground'
              )}
              title={translate(
                key === 'color'
                  ? 'gallery.videoReview.keyColor'
                  : 'gallery.videoReview.keyBackground'
              )}
              value={style(key) ?? '#ffffff'}
              onChange={(value) => props.onChange({ style: { [key]: value, opacity: 1 } })}
            />
          ))}
          {(['before', 'after', 'offset'] as const).map((key) => (
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
              onCommitValue={(value) => props.onChange({ [key]: value / 1000 })}
            />
          ))}
        </>
      ) : null}
      <ReviewButton
        className={reviewTextButtonClassName}
        label={translate('gallery.videoReview.clickReset')}
        onClick={() => props.onChange(null)}
      />
    </div>
  );
}
function KeyNumber(props: Omit<NumericRowProps, 'onPreviewValue'>) {
  const [draft, setDraft] = useState<number>();
  useEffect(() => setDraft(undefined), [props.value]);
  return (
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
  );
}
