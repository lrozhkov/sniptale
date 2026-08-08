import { translate } from '../../../../platform/i18n';
import {
  settingsSectionClassName,
  SettingsSectionHeader,
  SettingsSubpageTabs,
} from '../../../section-surface';
import { HighlighterSection } from './borders';
import { CalloutPresetCatalogSettings, useCalloutPresetCatalogController } from './callouts';
import { StepBadgePresetCatalogSettings, useStepBadgePresetCatalogController } from './numbering';

function CalloutsSection() {
  const controller = useCalloutPresetCatalogController();
  return (
    <section className={settingsSectionClassName}>
      <SettingsSectionHeader kicker={translate('settings.navigation.views.callouts')} />
      <CalloutPresetCatalogSettings controller={controller} />
    </section>
  );
}

function NumberingSection() {
  const controller = useStepBadgePresetCatalogController();
  return (
    <section className={settingsSectionClassName}>
      <SettingsSectionHeader kicker={translate('settings.navigation.views.numbering')} />
      <StepBadgePresetCatalogSettings controller={controller} />
    </section>
  );
}

export function AnnotationsSection(props: {
  onViewChange?: (view: string) => void;
  view?: string;
}) {
  const view = ['callouts', 'numbering'].includes(props.view ?? '')
    ? (props.view as 'callouts' | 'numbering')
    : 'borders';
  return (
    <div className="space-y-5">
      <SettingsSubpageTabs
        activeId={view}
        ariaLabel={translate('settings.navigation.annotations')}
        items={[
          { id: 'borders', label: translate('settings.navigation.views.borders') },
          { id: 'callouts', label: translate('settings.navigation.views.callouts') },
          { id: 'numbering', label: translate('settings.navigation.views.numbering') },
        ]}
        onChange={props.onViewChange}
      />
      {view === 'callouts' ? (
        <CalloutsSection />
      ) : view === 'numbering' ? (
        <NumberingSection />
      ) : (
        <HighlighterSection />
      )}
    </div>
  );
}
