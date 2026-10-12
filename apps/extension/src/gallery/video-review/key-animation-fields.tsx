import { reviewInformationSections } from './inspector-sections';
import { Keyboard, Palette, Clock3, Move, RotateCcw } from 'lucide-react';
import { reviewInspectorActions, ReviewInspectorSections } from './inspector-sections';
import { useEffect, useState, type ReactNode } from 'react';
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
export function ReviewKeyFields(props: Parameters<typeof reviewKeySections>[0]) {
  return (
    <div className="min-w-0" data-ui="gallery.videoReview.keyFields">
      <ReviewInspectorSections sections={reviewKeySections(props)} />
    </div>
  );
}

export function reviewKeySections(props: {
  information?: ReactNode;
  extraSections?: Parameters<typeof ReviewInspectorSections>[0]['sections'];
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
    <>
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
      {style(key) === undefined ? (
        <p className="text-right text-xs italic text-[var(--sniptale-color-text-muted)]">
          {translate('gallery.videoReview.clickMixed')}
        </p>
      ) : null}
    </>
  );
  const sections = reviewInformationSections(props.information);
  sections.push({
    id: 'display',
    label: translate('gallery.videoReview.keyDisplay'),
    icon: Keyboard,
    content: (
      <KeyDisplay enabled={enabled} onChange={props.onChange}>
        {props.values.some((value) => value.enabled)
          ? select('entrance', ['none', 'fade', 'slide'])
          : null}
      </KeyDisplay>
    ),
  });
  if (props.values.some((value) => value.enabled))
    sections.push(
      {
        id: 'appearance',
        label: translate('gallery.videoReview.clickAppearance'),
        icon: Palette,
        content: <KeyAppearance style={style} onChange={props.onChange} />,
      },
      {
        id: 'timing',
        label: translate('gallery.videoReview.clickTiming'),
        icon: Clock3,
        content: (
          <>
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
        ),
      },
      {
        id: 'position',
        label: translate('gallery.videoReview.clickPosition'),
        icon: Move,
        content: (
          <>
            {select('position', [
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
              onCommitValue={(margin) => props.onChange({ style: { margin } })}
            />
          </>
        ),
      }
    );
  sections.push(
    reviewInspectorActions(
      <>
        <ReviewButton
          className={`${reviewTextButtonClassName} !w-full justify-start`}
          label={translate('gallery.videoReview.keyReset')}
          onClick={() => props.onChange(null)}
        >
          <RotateCcw size={15} aria-hidden="true" />
          {translate('gallery.videoReview.keyReset')}
        </ReviewButton>
      </>
    )
  );
  if (props.extraSections) sections.push(...props.extraSections);
  return sections;
}
/** Display enablement stays distinct from the preserved keyboard appearance and timing. */
function KeyDisplay({
  enabled,
  onChange,
  children,
}: {
  enabled: boolean | undefined;
  onChange: Parameters<typeof reviewKeySections>[0]['onChange'];
  children: ReactNode;
}) {
  return (
    <>
      <SelectField
        className={reviewSelectFieldClassName}
        label={translate('gallery.videoReview.keyDisplay')}
        value={enabled === undefined ? '' : enabled ? 'on' : 'off'}

        options={[
          { value: 'off', label: translate('gallery.videoReview.click_off') },
          { value: 'on', label: translate('gallery.videoReview.keyCaption') },
        ]}
        onChange={(value) => onChange({ enabled: value === 'on' })}
      />
      {enabled === undefined ? (
        <p className="text-right text-xs italic text-[var(--sniptale-color-text-muted)]">
          {translate('gallery.videoReview.clickMixed')}
        </p>
      ) : null}
      {children}
    </>
  );
}

/** Typography and colors share the existing patch-only keyboard style owner. */
function KeyAppearance({
  style,
  onChange,
}: {
  style<K extends keyof VideoActionKeyStyle>(key: K): VideoActionKeyStyle[K] | undefined;
  onChange: Parameters<typeof reviewKeySections>[0]['onChange'];
}) {
  return (
    <>
      {(['fontSize', 'cornerRadius'] as const).map((key) => (
        <KeyNumber
          key={key}
          label={translate(`gallery.videoReview.key_${key}`)}
          value={style(key) ?? null}
          min={key === 'fontSize' ? 12 : 0}
          max={key === 'fontSize' ? 96 : 32}
          scrub={{
            min: key === 'fontSize' ? 12 : 0,
            max: key === 'fontSize' ? 48 : 32,
            step: 1,
          }}
          unit="px"
          step={1}
          precision={0}
          onCommitValue={(value) => onChange({ style: { [key]: value } })}
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
            onChange={(value) => onChange({ style: { [key]: value, opacity: 1 } })}
          />
          {style(key) === undefined ? (
            <p className="text-right text-xs italic text-[var(--sniptale-color-text-muted)]">
              {translate('gallery.videoReview.clickMixed')}
            </p>
          ) : null}
        </div>
      ))}
    </>
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
