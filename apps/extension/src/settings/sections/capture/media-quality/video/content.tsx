import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import { translate } from '../../../../../platform/i18n';
import {
  SettingsCollection,
  SettingsSectionHeader,
  settingsSectionClassName,
  type SettingsCollectionAction,
  type SettingsCollectionItem,
} from '../../../../section-surface';
import type { VideoRecordingProfile } from '@sniptale/runtime-contracts/video/types/types';
import { getProfileName, getProfileSummary } from './profile-copy';
import type { ReturnTypeUseProfiles } from './types';
import { VideoQualityProfileEditor } from './profile-editor';

function createProfileItems(
  profiles: readonly VideoRecordingProfile[],
  selectedId: string | null,
  busy: boolean,
  editable: boolean
): readonly SettingsCollectionItem[] {
  return profiles.map((profile) => ({
    id: profile.id,
    title: getProfileName(profile),
    meta: getProfileSummary(profile),
    isDefault: profile.id === selectedId,
    busy,
    capabilities: {
      edit: editable,
      setDefault: profile.id !== selectedId,
      delete: editable,
    },
  }));
}

function ProfileCollection(props: {
  addAction?: { label: string; disabled: boolean; onInvoke(): void };
  editable: boolean;
  emptyState?: string;
  profiles: readonly VideoRecordingProfile[];
  root: ReturnTypeUseProfiles;
  title: string;
}) {
  const byId = new Map(props.profiles.map((profile) => [profile.id, profile]));
  const onAction = (action: SettingsCollectionAction) => {
    const profile = byId.get(action.itemId);
    if (!profile) return;
    if (action.type === 'set-default') void props.root.actions.selectProfile(profile);
    if (action.type === 'edit') props.root.dialogs.setEditor({ profile });
    if (action.type === 'delete') props.root.dialogs.setDeleteProfile(profile);
  };
  return (
    <SettingsCollection
      ariaLabel={props.title}
      title={props.title}
      items={createProfileItems(
        props.profiles,
        props.root.profiles.selectedId,
        props.root.state.busy,
        props.editable
      )}
      {...(props.addAction ? { addAction: props.addAction } : {})}
      {...(props.emptyState ? { emptyState: props.emptyState } : {})}
      onAction={onAction}
    />
  );
}

export function VideoQualityProfilesContent(props: ReturnTypeUseProfiles) {
  const { actions, dialogs, profiles, state } = props;
  return (
    <div className={settingsSectionClassName}>
      <SettingsSectionHeader
        kicker={translate('settings.videoQuality.kicker')}
        title={translate('settings.videoQuality.title')}
        description={translate('settings.videoQuality.description')}
      />
      {state.error ? (
        <p role="alert" className="text-sm text-[var(--sniptale-color-danger)]">
          {state.error}
        </p>
      ) : null}
      <ProfileCollection
        editable={false}
        profiles={profiles.builtIn}
        root={props}
        title={translate('settings.videoQuality.builtInTitle')}
      />
      <ProfileCollection
        editable
        profiles={profiles.custom}
        root={props}
        title={translate('settings.videoQuality.customTitle')}
        emptyState={translate('settings.videoQuality.customEmpty')}
        addAction={{
          label: translate('settings.videoQuality.addProfile'),
          disabled: state.busy || profiles.isAtLimit,
          onInvoke: () => dialogs.setEditor({}),
        }}
      />
      {dialogs.editor ? (
        <VideoQualityProfileEditor
          busy={state.busy}
          onClose={() => dialogs.setEditor(null)}
          onSave={actions.saveProfile}
          {...(dialogs.editor.profile ? { profile: dialogs.editor.profile } : {})}
        />
      ) : null}
      <ProductConfirmDialog
        isOpen={dialogs.deleteProfile !== null}
        title={translate('settings.videoQuality.deleteTitle')}
        message={translate('settings.videoQuality.deleteMessage')}
        confirmText={translate('settings.videoQuality.deleteProfile')}
        cancelText={translate('settings.videoQuality.cancel')}
        onConfirm={() => void actions.confirmDelete()}
        onCancel={() => dialogs.setDeleteProfile(null)}
      />
    </div>
  );
}
