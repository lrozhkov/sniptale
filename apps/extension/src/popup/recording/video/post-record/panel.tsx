import { Download, Film, Images, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { translate } from '../../../../platform/i18n';
import {
  deleteSavedRecordingTracks,
  downloadSavedRecordingTracks,
  openLatestRecordingInGallery,
  openSavedRecordingInVideoEditor,
} from './actions';

function PostRecordActionButton({
  icon: Icon,
  label,
  onClick,
  tone = 'default',
}: {
  icon: typeof Images;
  label: string;
  onClick: () => void;
  tone?: 'danger' | 'default';
}) {
  return (
    <button
      type="button"
      className={[
        'inline-flex h-9 items-center justify-center gap-2 rounded-[10px] px-3 text-xs font-semibold transition-colors',
        tone === 'danger'
          ? 'text-[var(--sniptale-color-danger)] hover:bg-[var(--sniptale-color-danger-soft)]'
          : 'text-[var(--sniptale-color-text-primary)] hover:bg-[var(--sniptale-color-surface-hover)]',
      ].join(' ')}
      title={label}
      onClick={onClick}
    >
      <Icon className="h-4 w-4" />
      <span className="truncate">{label}</span>
    </button>
  );
}

export function VideoPostRecordPanel({
  onClose,
  recordingId,
}: {
  onClose: () => void;
  recordingId: string;
}) {
  const [actionError, setActionError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const runAction = createPostRecordActionRunner({ setActionError, setIsBusy });
  const handleDelete = createPostRecordDeleteHandler({ onClose, recordingId, runAction });

  return (
    <div
      className={[
        'flex min-h-0 flex-1 flex-col justify-center gap-4 rounded-[14px] border p-4',
        'border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-canvas)]',
      ].join(' ')}
    >
      <div className="text-center">
        <div className="text-base font-semibold text-[var(--sniptale-color-text-primary)]">
          {translate('popup.video.postRecordTitle')}
        </div>
        <div className="mt-1 text-xs text-[var(--sniptale-color-text-muted-strong)]">
          {translate('popup.video.postRecordDescription')}
        </div>
      </div>
      <PostRecordActionGrid
        isBusy={isBusy}
        onClose={onClose}
        onDelete={handleDelete}
        recordingId={recordingId}
        runAction={runAction}
      />
      {actionError ? (
        <div
          className={[
            'rounded-[10px] border border-[var(--sniptale-color-danger-soft)] px-3 py-2',
            'text-xs text-[var(--sniptale-color-danger)]',
          ].join(' ')}
          role="alert"
        >
          {actionError}
        </div>
      ) : null}
    </div>
  );
}

function createPostRecordActionRunner({
  setActionError,
  setIsBusy,
}: {
  setActionError: (error: string | null) => void;
  setIsBusy: (isBusy: boolean) => void;
}) {
  return (action: () => Promise<void>) => {
    setActionError(null);
    setIsBusy(true);
    void action()
      .catch(() => setActionError(translate('popup.video.postRecordActionError')))
      .finally(() => setIsBusy(false));
  };
}

function createPostRecordDeleteHandler(args: {
  onClose: () => void;
  recordingId: string;
  runAction: (action: () => Promise<void>) => void;
}) {
  return () => {
    if (!window.confirm(translate('popup.video.postRecordDeleteConfirm'))) {
      return;
    }

    args.runAction(async () => {
      await deleteSavedRecordingTracks(args.recordingId);
      args.onClose();
    });
  };
}

function PostRecordActionGrid({
  isBusy,
  onClose,
  onDelete,
  recordingId,
  runAction,
}: {
  isBusy: boolean;
  onClose: () => void;
  onDelete: () => void;
  recordingId: string;
  runAction: (action: () => Promise<void>) => void;
}) {
  return (
    <div
      className="grid grid-cols-1 gap-2 opacity-100 data-[busy=true]:pointer-events-none data-[busy=true]:opacity-60"
      data-busy={isBusy}
    >
      <PostRecordActionButton
        icon={Film}
        label={translate('popup.video.postRecordOpenEditor')}
        onClick={() => runAction(() => openSavedRecordingInVideoEditor(recordingId))}
      />
      <PostRecordActionButton
        icon={Images}
        label={translate('popup.video.postRecordOpenGallery')}
        onClick={() => runAction(() => openLatestRecordingInGallery(recordingId))}
      />
      <PostRecordActionButton
        icon={Download}
        label={translate('popup.video.postRecordDownload')}
        onClick={() => runAction(() => downloadSavedRecordingTracks(recordingId))}
      />
      <PostRecordActionButton
        icon={X}
        label={translate('popup.video.postRecordClose')}
        onClick={onClose}
      />
      <PostRecordActionButton
        icon={Trash2}
        label={translate('popup.video.postRecordDelete')}
        tone="danger"
        onClick={onDelete}
      />
    </div>
  );
}
