import { InformationDisclosure } from '../../../ui/compact-inspector-controls/disclosure';
import { ToggleField } from '../../../ui/compact-inspector-controls/controls';
import { TourChoiceField } from './fields';
import type { TourDocument, TourSlide } from '@sniptale/runtime-contracts/scenario/types/tour';
import { Play, Timer } from 'lucide-react';
import { GuideInspectorGroup } from '../inspector';
import { TourInspectorNumericRow } from './numeric-row';
import type { Translate } from '../../../platform/i18n';

/** Playback defaults are document settings, independent of the selected slide. */
export function TourPlaybackSettings({
  tour,
  disabled,
  onChange,
  t,
}: {
  tour: TourDocument;
  disabled: boolean;
  onChange: (tour: TourDocument) => boolean;
  t: Translate;
}) {
  const changeMinimum = (minimumHoldSeconds: number) =>
    onChange({ ...tour, playback: { ...tour.playback, minimumHoldSeconds } });
  return (
    <GuideInspectorGroup id="playback" icon={Play} title={t('scenario.editor.tourPlayback')}>
      {(
        [
          ['autoplay', t('scenario.editor.tourAutoplay')],
          ['loop', t('scenario.editor.tourLoop')],
          ['autoZoom', t('scenario.editor.tourAutoZoom')],
        ] as const
      ).map(([key, label]) => (
        <ToggleField
          key={key}
          disabled={disabled}
          value={tour.playback[key]}
          label={label}
          onChange={() =>
            onChange({ ...tour, playback: { ...tour.playback, [key]: !tour.playback[key] } })
          }
        />
      ))}
      <TourInspectorNumericRow
        label={t('scenario.editor.tourMinimumHold')}
        value={tour.playback.minimumHoldSeconds}
        min={0.1}
        max={3600}
        unit="s"
        scrub={{ min: 0.1, max: 10, step: 0.1 }}
        step={0.5}
        precision={1}
        disabled={disabled}
        onPreview={changeMinimum}
        onChange={changeMinimum}
      />
      <InformationDisclosure label={t('common.actions.details')}>
        <p>{t('scenario.editor.tourAutoplayHint')}</p>
      </InformationDisclosure>
    </GuideInspectorGroup>
  );
}

/** A slide may override hold time and choose its default branch without changing click actions. */
export function TourTimingSettings({
  hasNarration,
  slide,
  disabled,
  onChange,
  t,
}: {
  tour: TourDocument;
  slide: TourSlide;
  hasNarration?: boolean;
  disabled: boolean;
  onChange: (slide: TourSlide) => boolean;
  t: Translate;
}) {
  const timing = slide.timing;
  const changeHold = (holdSeconds: number) =>
    onChange({ ...slide, timing: { ...timing, holdSeconds } });
  return (
    <GuideInspectorGroup id="timing" icon={Timer} title={t('scenario.editor.tourTiming')}>
      <div className="tour-text-field">
        <TourChoiceField
          label={t('scenario.editor.tourDurationMode')}
          value={timing.mode}
          disabled={disabled}
          options={[
            { value: 'inherit', label: t('scenario.editor.tourInherited') },
            { value: 'auto', label: t('scenario.editor.tourDurationAuto') },
            { value: 'manual', label: t('scenario.editor.tourDurationManual') },
          ]}
          onChange={(mode) => onChange({ ...slide, timing: { ...timing, mode } })}
        />
      </div>
      {timing.mode === 'manual' && (
        <>
          <TourInspectorNumericRow
            label={t('scenario.editor.tourHoldSeconds')}
            value={timing.holdSeconds}
            min={0.1}
            max={3600}
            unit="s"
            scrub={{ min: 0.1, max: 10, step: 0.1 }}
            step={0.5}
            precision={1}
            disabled={disabled}
            onPreview={changeHold}
            onChange={changeHold}
          />
          {(hasNarration ?? Boolean(slide.narration)) && (
            <ToggleField
              disabled={disabled}
              value={timing.truncateNarration}
              label={t('scenario.editor.tourTruncateNarration')}
              onChange={() =>
                onChange({
                  ...slide,
                  timing: { ...timing, truncateNarration: !timing.truncateNarration },
                })
              }
            />
          )}
        </>
      )}
      <InformationDisclosure label={t('common.actions.details')}>
        <p>{t('scenario.editor.tourTimingHint')}</p>
      </InformationDisclosure>
    </GuideInspectorGroup>
  );
}
