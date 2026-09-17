import type { TourDocument } from '@sniptale/runtime-contracts/scenario/types/tour';
import { Layers } from 'lucide-react';
import { GuideInspectorGroup } from '../inspector';
import { CompactSelect } from '../../../ui/compact-inspector-controls/select';
import { TourInspectorNumericRow } from './numeric-row';
import type { Translate } from '../../../platform/i18n';

/** One transition style applies to every scene; targets keep their source coordinates. */
export function TourTransitionSettings({
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
  const transition = tour.transition;
  const changeSwitch = (durationMs: number) =>
    onChange({ ...tour, transition: { ...transition, durationMs } });
  const changeTravel = (hotspotTravelMs: number) =>
    onChange({ ...tour, transition: { ...transition, hotspotTravelMs } });
  return (
    <GuideInspectorGroup icon={Layers} title={t('scenario.editor.tourTransitions')}>
      <CompactSelect
        aria-label={t('scenario.editor.tourTransitionKind')}
        value={transition.kind}
        disabled={disabled}
        options={[
          { value: 'none', label: t('scenario.editor.tourTransitionNone') },
          { value: 'fade', label: t('scenario.editor.tourTransitionFade') },
          { value: 'slide', label: t('scenario.editor.tourTransitionSlide') },
        ]}
        onChange={(kind) => onChange({ ...tour, transition: { ...transition, kind } })}
      />
      {transition.kind !== 'none' && (
        <TourInspectorNumericRow
          label={t('scenario.editor.tourSwitchMs')}
          value={transition.durationMs}
          min={0}
          max={2000}
          step={50}
          disabled={disabled}
          onPreview={changeSwitch}
          onChange={changeSwitch}
        />
      )}
      <TourInspectorNumericRow
        label={t('scenario.editor.tourTravelMs')}
        value={transition.hotspotTravelMs}
        min={0}
        max={2000}
        step={50}
        disabled={disabled}
        onPreview={changeTravel}
        onChange={changeTravel}
      />
      <p className="guide-inspector-hint">{t('scenario.editor.tourTransitionHint')}</p>
    </GuideInspectorGroup>
  );
}
