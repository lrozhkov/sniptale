import { useSavePresetsSection } from './state/controller';
import { SavePresetsSectionContent } from './surface/content';
import { translate } from '../../../../platform/i18n';
import { SettingsSubpageTabs } from '../../../section-surface';
import { StorageDraftsSection } from '../storage-drafts';

export function SavePresetsSection(props: {
  onViewChange?: (view: string) => void;
  view?: string;
}) {
  const savePresetsSection = useSavePresetsSection();
  const { editingPreset, ...contentProps } = savePresetsSection;
  const view = props.view === 'templates' || props.view === 'storage' ? props.view : 'settings';

  return (
    <div className="space-y-5">
      <SettingsSubpageTabs
        activeId={view}
        ariaLabel={translate('settings.navigation.saving')}
        items={[
          { id: 'settings', label: translate('settings.navigation.views.settings') },
          { id: 'storage', label: translate('settings.navigation.views.storage') },
          {
            id: 'templates',
            label: translate('settings.navigation.views.folderTemplates'),
          },
        ]}
        onChange={props.onViewChange}
      />
      {view !== 'storage' ? (
        <SavePresetsSectionContent
          {...contentProps}
          onMoveBefore={savePresetsSection.handleMoveBefore}
          view={view}
          {...(editingPreset === undefined ? {} : { editingPreset })}
        />
      ) : null}
      {view === 'settings' || view === 'storage' ? <StorageDraftsSection view={view} /> : null}
    </div>
  );
}
