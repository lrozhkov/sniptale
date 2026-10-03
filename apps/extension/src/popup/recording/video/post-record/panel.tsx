import { Download, Film, Clapperboard, Library, Trash2, X } from 'lucide-react';
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
  prominent = false,
}: {
  icon: typeof Library;
  disabled: boolean;
  label: string;
  onClick: () => void;
  tone?: 'danger' | 'default';
  prominent?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={[
        'group flex min-w-0 items-center justify-center rounded-xl text-xs font-medium',
        'transition-colors motion-reduce:transition-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-accent)]',
        prominent
          ? [
              'min-h-28 flex-col gap-3 border border-[var(--sniptale-color-border-soft)]',
              'bg-[var(--sniptale-color-surface-panel)] px-3 py-4',
              'hover:bg-[var(--sniptale-color-surface-hover)]',
            ].join(' ')
          : 'min-h-10 flex-row gap-2 px-2 py-2',
        tone === 'danger'
          ? [
              'text-[var(--sniptale-color-text-muted-strong)]',
              'hover:bg-[var(--sniptale-color-danger-soft)] hover:text-[var(--sniptale-color-danger)]',
            ].join(' ')
          : 'text-[var(--sniptale-color-text-primary)] hover:bg-[var(--sniptale-color-surface-hover)]',
      ].join(' ')}
      title={label}
      onClick={onClick}
    >
      <Icon
        aria-hidden="true"
        className={
          prominent
            ? [
                'h-6 w-6 shrink-0 text-[var(--sniptale-color-text-secondary)] transition-colors',
                'group-hover:text-[var(--sniptale-color-accent)]',
                'group-focus-visible:text-[var(--sniptale-color-accent)]',
              ].join(' ')
            : 'h-4 w-4 shrink-0'
        }
      />
      <span className="text-balance leading-relaxed">{label}</span>
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
    <div className={['flex min-h-0 flex-1 flex-col gap-5 px-2 pb-1 pt-5'].join(' ')}>
      <div className="px-2 text-center">
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
    <div className="flex flex-1 flex-col gap-3" data-busy={isBusy}>
      <div className="grid grid-cols-2 gap-2">
        <PostRecordActionButton
          prominent
          disabled={isBusy}
          icon={Clapperboard}
          label={translate('popup.video.postRecordQuickEdit')}
          onClick={() =>
            runDecision(() => openLatestRecordingInGallery(result.primaryRecordingId, true))
          }
        />
        <PostRecordActionButton
          disabled={isBusy}
          prominent
          icon={Film}
          label={translate('popup.video.postRecordOpenEditor')}
          onClick={() => runDecision(() => openSavedRecordingInVideoEditor(result))}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <PostRecordActionButton
          disabled={isBusy}
          icon={Library}
          label={translate('popup.video.postRecordOpenGallery')}
          onClick={() => runDecision(() => openLatestRecordingInGallery(result.primaryRecordingId))}
        />
        <PostRecordActionButton
          disabled={isBusy}
          icon={Download}
          label={translate('popup.video.postRecordDownload')}
          onClick={() => runDecision(() => downloadSavedRecordingTracks(result.recordingId))}
        />
      </div>
      <div className="mt-auto flex flex-col gap-2 pt-4">
        <PostRecordActionButton
          disabled={isBusy}
          icon={X}
          label={translate('popup.video.postRecordClose')}
          onClick={() => runDecision(() => Promise.resolve())}
        />
        <div className="flex justify-center border-t border-[var(--sniptale-color-border-soft)] pt-2">
          <PostRecordActionButton
            disabled={isBusy}
            icon={Trash2}
            label={translate('popup.video.postRecordDelete')}
            tone="danger"
            onClick={onDelete}
          />
        </div>
      </div>
    </div>
  );
}
