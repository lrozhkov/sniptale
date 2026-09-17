import type { TourDocument, TourSlide } from '@sniptale/runtime-contracts/scenario/types/tour';
import { Play, Timer } from 'lucide-react';
import { ProductToggle } from '@sniptale/ui/product-form-controls';
import { GuideInspectorGroup } from '../inspector';
import { CompactSelect } from '../../../ui/compact-inspector-controls/select';
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
    <GuideInspectorGroup icon={Play} title={t('scenario.editor.tourPlayback')}>
      {(
        [
          ['autoplay', t('scenario.editor.tourAutoplay')],
          ['loop', t('scenario.editor.tourLoop')],
          ['autoZoom', t('scenario.editor.tourAutoZoom')],
        ] as const
      ).map(([key, label]) => (
        <label className="guide-number-toggle" key={key}>
          <ProductToggle
            size="sm"
            disabled={disabled}
            checked={tour.playback[key]}
            aria-label={label}
            onClick={() =>
              onChange({ ...tour, playback: { ...tour.playback, [key]: !tour.playback[key] } })
            }
          />
          {label}
        </label>
      ))}
      <TourInspectorNumericRow
        label={t('scenario.editor.tourMinimumHold')}
        value={tour.playback.minimumHoldSeconds}
        min={0.1}
        max={3600}
        step={0.5}
        precision={1}
        disabled={disabled}
        onPreview={changeMinimum}
        onChange={changeMinimum}
      />
      <p className="guide-inspector-hint">{t('scenario.editor.tourAutoplayHint')}</p>
    </GuideInspectorGroup>
  );
}

/** A slide may override hold time and choose its default branch without changing click actions. */
export function TourTimingSettings({
  tour,
  slide,
  disabled,
  onChange,
  t,
}: {
  tour: TourDocument;
  slide: TourSlide;
  disabled: boolean;
  onChange: (slide: TourSlide) => boolean;
  t: Translate;
}) {
  const timing = slide.timing;
  const changeHold = (holdSeconds: number) =>
    onChange({ ...slide, timing: { ...timing, holdSeconds } });
  return (
    <GuideInspectorGroup icon={Timer} title={t('scenario.editor.tourTiming')}>
      <CompactSelect
        aria-label={t('scenario.editor.tourDurationMode')}
        value={timing.mode}
        disabled={disabled}
        options={[
          { value: 'inherit', label: t('scenario.editor.tourInherited') },
          { value: 'auto', label: t('scenario.editor.tourDurationAuto') },
          { value: 'manual', label: t('scenario.editor.tourDurationManual') },
        ]}
        onChange={(mode) => onChange({ ...slide, timing: { ...timing, mode } })}
      />
      {timing.mode === 'manual' && (
        <>
          <TourInspectorNumericRow
            label={t('scenario.editor.tourHoldSeconds')}
            value={timing.holdSeconds}
            min={0.1}
            max={3600}
            step={0.5}
            precision={1}
            disabled={disabled}
            onPreview={changeHold}
            onChange={changeHold}
          />
          {slide.narration && (
            <label className="guide-number-toggle">
              <ProductToggle
                size="sm"
                disabled={disabled}
                checked={timing.truncateNarration}
                aria-label={t('scenario.editor.tourTruncateNarration')}
                onClick={() =>
                  onChange({
                    ...slide,
                    timing: { ...timing, truncateNarration: !timing.truncateNarration },
                  })
                }
              />
              {t('scenario.editor.tourTruncateNarration')}
            </label>
          )}
        </>
      )}
      <CompactSelect
        aria-label={t('scenario.editor.tourAutomaticTransition')}
        value={timing.autoplayTarget ?? ''}
        disabled={disabled}
        options={[
          { value: '', label: t('scenario.editor.tourFollowActions') },
          ...tour.slides.map((entry, index) => ({
            value: entry.id,
            label: `${index + 1}. ${entry.title}`,
          })),
        ]}
        onChange={(target) =>
          onChange({ ...slide, timing: { ...timing, autoplayTarget: target || null } })
        }
      />
      <p className="guide-inspector-hint">{t('scenario.editor.tourTimingHint')}</p>
    </GuideInspectorGroup>
  );
}
