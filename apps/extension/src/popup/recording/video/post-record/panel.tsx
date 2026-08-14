import { Download, Film, Images, Trash2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import type { VideoPostRecordResult } from '@sniptale/runtime-contracts/video/types/types';
import { translate } from '../../../../platform/i18n/popup';
import {
  deleteVideoPostRecordResult,
  downloadSavedRecordingTracks,
  openLatestRecordingInGallery,
  openSavedRecordingInVideoEditor,
} from '../../../../workflows/media-hub/post-record-actions';

function PostRecordActionButton({
  icon: Icon,
  disabled,
  label,
  onClick,
  tone = 'default',
}: {
  icon: typeof Images;
  disabled: boolean;
  label: string;
  onClick: () => void;
  tone?: 'danger' | 'default';
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={[
        'inline-flex h-9 items-center justify-center gap-2 rounded-[10px] px-3',
        'text-xs font-semibold transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-60',
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
  onAcknowledge,
  result,
}: {
  onAcknowledge: () => Promise<void>;
  result: VideoPostRecordResult;
}) {
  const [actionError, setActionError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const isBusyRef = useRef(false);
  const runAction = createPostRecordActionRunner({ isBusyRef, setActionError, setIsBusy });
  const runDecision = (action: () => Promise<void>) =>
    runAction(async () => {
      await action();
      await onAcknowledge();
    });
  const handleDelete = createPostRecordDeleteHandler({ result, runDecision });

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
        onDelete={handleDelete}
        result={result}
        runDecision={runDecision}
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
  isBusyRef,
  setActionError,
  setIsBusy,
}: {
  isBusyRef: { current: boolean };
  setActionError: (error: string | null) => void;
  setIsBusy: (isBusy: boolean) => void;
}) {
  return (action: () => Promise<void>) => {
    if (isBusyRef.current) return;
    isBusyRef.current = true;
    setActionError(null);
    setIsBusy(true);
    void action()
      .catch(() => setActionError(translate('popup.video.postRecordActionError')))
      .finally(() => {
        isBusyRef.current = false;
        setIsBusy(false);
      });
  };
}

function createPostRecordDeleteHandler(args: {
  result: VideoPostRecordResult;
  runDecision: (action: () => Promise<void>) => void;
}) {
  return () => {
    if (!window.confirm(translate('popup.video.postRecordDeleteConfirm'))) {
      return;
    }

    args.runDecision(async () => {
      await deleteVideoPostRecordResult(args.result);
    });
  };
}

function PostRecordActionGrid({
  isBusy,
  onDelete,
  result,
  runDecision,
}: {
  isBusy: boolean;
  onDelete: () => void;
  result: VideoPostRecordResult;
  runDecision: (action: () => Promise<void>) => void;
}) {
  return (
    <div
      className="grid grid-cols-1 gap-2 opacity-100 data-[busy=true]:pointer-events-none data-[busy=true]:opacity-60"
      data-busy={isBusy}
    >
      <PostRecordActionButton
        disabled={isBusy}
        icon={Film}
        label={translate('popup.video.postRecordOpenEditor')}
        onClick={() => runDecision(() => openSavedRecordingInVideoEditor(result))}
      />
      <PostRecordActionButton
        disabled={isBusy}
        icon={Images}
        label={translate('popup.video.postRecordOpenGallery')}
        onClick={() => runDecision(() => openLatestRecordingInGallery(result.primaryRecordingId))}
      />
      <PostRecordActionButton
        disabled={isBusy}
        icon={Download}
        label={translate('popup.video.postRecordDownload')}
        onClick={() => runDecision(() => downloadSavedRecordingTracks(result.recordingId))}
      />
      <PostRecordActionButton
        disabled={isBusy}
        icon={X}
        label={translate('popup.video.postRecordClose')}
        onClick={() => runDecision(() => Promise.resolve())}
      />
      <PostRecordActionButton
        disabled={isBusy}
        icon={Trash2}
        label={translate('popup.video.postRecordDelete')}
        tone="danger"
        onClick={onDelete}
      />
    </div>
  );
}
