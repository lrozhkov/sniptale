import { InformationDisclosure } from '../../../ui/compact-inspector-controls/disclosure';
import { TourChoiceField } from './fields';
import type { TourDocument } from '@sniptale/runtime-contracts/scenario/types/tour';
import { Layers } from 'lucide-react';
import { GuideInspectorGroup } from '../inspector';
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
    <GuideInspectorGroup
      id="transitions"
      icon={Layers}
      title={t('scenario.editor.tourTransitions')}
    >
      <div className="tour-text-field">
        <TourChoiceField
          label={t('scenario.editor.tourTransitionKind')}
          value={transition.kind}
          disabled={disabled}
          options={[
            { value: 'none', label: t('scenario.editor.tourTransitionNone') },
            { value: 'fade', label: t('scenario.editor.tourTransitionFade') },
            { value: 'slide', label: t('scenario.editor.tourTransitionSlide') },
          ]}
          onChange={(kind) => onChange({ ...tour, transition: { ...transition, kind } })}
        />
      </div>
      {transition.kind !== 'none' && (
        <TourInspectorNumericRow
          label={t('scenario.editor.tourSwitchMs')}
          value={transition.durationMs / 1000}
          min={0}
          max={2}
          unit="s"
          precision={3}
          step={0.05}
          disabled={disabled}
          onPreview={(seconds) => changeSwitch(Math.round(seconds * 1000))}
          onChange={(seconds) => changeSwitch(Math.round(seconds * 1000))}
        />
      )}
      <TourInspectorNumericRow
        label={t('scenario.editor.tourTravelMs')}
        value={transition.hotspotTravelMs / 1000}
        min={0}
        max={2}
        unit="s"
        precision={3}
        step={0.05}
        disabled={disabled}
        onPreview={(seconds) => changeTravel(Math.round(seconds * 1000))}
        onChange={(seconds) => changeTravel(Math.round(seconds * 1000))}
      />
      <InformationDisclosure label={t('common.actions.details')}>
        <p>{t('scenario.editor.tourTransitionHint')}</p>
      </InformationDisclosure>
    </GuideInspectorGroup>
  );
}
