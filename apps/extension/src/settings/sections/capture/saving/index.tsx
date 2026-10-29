import { SyncConnectionSection } from './sync-connection';
import { SyncQueueSection } from './sync-queue';
import { SyncCacheSection } from './sync-cache';
import { FilenameRulesSettings } from './filename-rules';
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
  const connectionAvailable =
    typeof __SNIPTALE_SECURITY_E2E__ !== 'undefined' && __SNIPTALE_SECURITY_E2E__;
  const view =
    (connectionAvailable && props.view === 'connection') ||
    props.view === 'queue' ||
    props.view === 'templates' ||
    props.view === 'storage' ||
    props.view === 'files' ||
    props.view === 'drafts'
      ? props.view
      : 'settings';

  return (
    <div className="space-y-5">
      <SettingsSubpageTabs
        activeId={view}
        ariaLabel={translate('settings.navigation.saving')}
        items={[
          { id: 'settings', label: translate('settings.navigation.views.settings') },
          { id: 'files', label: translate('settings.navigation.views.files') },
          { id: 'drafts', label: translate('settings.navigation.views.drafts') },
          { id: 'storage', label: translate('settings.navigation.views.storage') },
          ...(connectionAvailable
            ? [{ id: 'connection', label: translate('settings.syncConnection.title') }]
            : []),
          { id: 'queue', label: translate('settings.syncQueue.title') },
          {
            id: 'templates',
            label: translate('settings.navigation.views.folderTemplates'),
          },
        ]}
        onChange={props.onViewChange}
      />
      {view !== 'storage' && view !== 'drafts' && view !== 'queue' && view !== 'connection' ? (
        <SavePresetsSectionContent
          {...contentProps}
          onMoveBefore={savePresetsSection.handleMoveBefore}
          view={view}
          {...(editingPreset === undefined ? {} : { editingPreset })}
        />
      ) : null}
      {view === 'connection' ? <SyncConnectionSection /> : null}
      {view === 'queue' ? <SyncQueueSection /> : null}
      {view === 'files' ? <FilenameRulesSettings /> : null}
      {view === 'storage' ? <StorageDraftsSection view="storage" /> : null}
      {view === 'storage' && connectionAvailable ? <SyncCacheSection /> : null}
      {view === 'drafts' ? <StorageDraftsSection view="drafts" /> : null}
    </div>
  );
}
