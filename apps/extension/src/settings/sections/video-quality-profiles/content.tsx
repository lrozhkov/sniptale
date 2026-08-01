import { Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import { translate } from '../../../platform/i18n';
import {
  SettingsSectionHeader,
  settingsAddButtonClassName,
  settingsDangerIconButtonClassName,
  settingsEmptyStateClassName,
  settingsInfoIconButtonClassName,
  settingsListRowClassName,
  settingsPanelClassName,
  settingsSectionClassName,
  settingsSuccessBadgeClassName,
} from '../../section-surface';
import type { VideoRecordingProfile } from '@sniptale/runtime-contracts/video/types/types';
import { getProfileName, getProfileSummary } from './profile-copy';
import type { ReturnTypeUseProfiles } from './types';
import { VideoQualityProfileEditor } from './profile-editor';

function ProfileRow(props: {
  active: boolean;
  busy: boolean;
  editable: boolean;
  onDelete?: () => void;
  onEdit?: () => void;
  onSelect: () => void;
  profile: VideoRecordingProfile;
}) {
  return (
    <div className={settingsListRowClassName}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
            {getProfileName(props.profile)}
          </h3>
          {props.active ? (
            <span className={settingsSuccessBadgeClassName}>
              {translate('settings.videoQuality.activeBadge')}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-[var(--sniptale-color-text-secondary)]">
          {getProfileSummary(props.profile)}
        </p>
      </div>
      <button
        type="button"
        className={settingsInfoIconButtonClassName}
        aria-label={translate('settings.videoQuality.useProfile')}
        disabled={props.busy || props.active}
        onClick={props.onSelect}
      >
        <Check size={16} />
      </button>
      {props.editable ? (
        <>
          <button
            type="button"
            className={settingsInfoIconButtonClassName}
            aria-label={translate('settings.videoQuality.editProfile')}
            disabled={props.busy}
            onClick={props.onEdit}
          >
            <Pencil size={16} />
          </button>
          <button
            type="button"
            className={settingsDangerIconButtonClassName}
            aria-label={translate('settings.videoQuality.deleteProfile')}
            disabled={props.busy}
            onClick={props.onDelete}
          >
            <Trash2 size={16} />
          </button>
        </>
      ) : null}
    </div>
  );
}

function ProfileGroup(props: {
  activeId: string | null;
  busy: boolean;
  editable: boolean;
  emptyText?: string;
  onDelete: (profile: VideoRecordingProfile) => void;
  onEdit: (profile: VideoRecordingProfile) => void;
  onSelect: (profile: VideoRecordingProfile) => void;
  profiles: readonly VideoRecordingProfile[];
  title: string;
}) {
  return (
    <section className={[settingsPanelClassName, 'space-y-3 p-4'].join(' ')}>
      <h2 className="text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
        {props.title}
      </h2>
      {props.profiles.length === 0 && props.emptyText ? (
        <div className={settingsEmptyStateClassName}>{props.emptyText}</div>
      ) : (
        <div className="grid gap-2">
          {props.profiles.map((profile) => (
            <ProfileRow
              key={profile.id}
              active={profile.id === props.activeId}
              busy={props.busy}
              editable={props.editable}
              onDelete={() => props.onDelete(profile)}
              onEdit={() => props.onEdit(profile)}
              onSelect={() => props.onSelect(profile)}
              profile={profile}
            />
          ))}
        </div>
      )}
    </section>
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
        aside={
          <button
            type="button"
            className={settingsAddButtonClassName}
            disabled={state.busy || profiles.isAtLimit}
            onClick={() => dialogs.setEditor({})}
          >
            <Plus size={16} />
            {translate('settings.videoQuality.addProfile')}
          </button>
        }
      />
      {state.error ? (
        <p role="alert" className="text-sm text-[var(--sniptale-color-danger)]">
          {state.error}
        </p>
      ) : null}
      <ProfileGroup
        activeId={profiles.selectedId}
        busy={state.busy}
        editable={false}
        onDelete={() => undefined}
        onEdit={() => undefined}
        onSelect={(profile) => void actions.selectProfile(profile)}
        profiles={profiles.builtIn}
        title={translate('settings.videoQuality.builtInTitle')}
      />
      <ProfileGroup
        activeId={profiles.selectedId}
        busy={state.busy}
        editable
        emptyText={translate('settings.videoQuality.customEmpty')}
        onDelete={dialogs.setDeleteProfile}
        onEdit={(profile) => dialogs.setEditor({ profile })}
        onSelect={(profile) => void actions.selectProfile(profile)}
        profiles={profiles.custom}
        title={translate('settings.videoQuality.customTitle')}
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
