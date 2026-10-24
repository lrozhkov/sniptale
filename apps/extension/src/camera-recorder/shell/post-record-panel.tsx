import { Download, Film, Library, Trash2, X, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { VideoPostRecordResult } from '@sniptale/runtime-contracts/video/types/types';
import { translate } from '../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import { useCommandPress } from '@sniptale/ui/control-language/press';
import {
  deleteVideoPostRecordResult,
  downloadSavedRecordingTracks,
  openLatestRecordingInGallery,
  openSavedRecordingInVideoEditor,
} from '../../workflows/media-hub/post-record-actions';

const POST_RECORD_MAIN_CLASS = [
  'sniptale-compact-workspace flex h-screen items-start justify-center overflow-y-auto',
  'bg-[var(--sniptale-color-surface-canvas)] p-3 text-[var(--sniptale-color-text-primary)]',
].join(' ');

const POST_RECORD_PANEL_CLASS = [
  'my-auto flex w-full max-w-[400px] shrink-0 flex-col gap-5 rounded-[8px]',
  'border border-[var(--sniptale-color-border-soft)]',
  'bg-[var(--sniptale-color-surface-panel)] p-4',
].join(' ');

export function CameraPostRecordPanel({
  onAcknowledge,
  result,
}: {
  onAcknowledge: () => Promise<void>;
  result: VideoPostRecordResult;
}) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!deleteConfirmOpen) return;
    const surface = panel.current?.closest('[data-recording-surface]');
    const cancel = () => setDeleteConfirmOpen(false);
    surface?.addEventListener('sniptale-recording-surface-change', cancel);
    return () => surface?.removeEventListener('sniptale-recording-surface-change', cancel);
  }, [deleteConfirmOpen]);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const isBusyRef = useRef(false);
  const run = (action: () => Promise<void>) => {
    if (isBusyRef.current) return;
    isBusyRef.current = true;
    setError(null);
    setIsBusy(true);
    void action()
      .catch(() => setError(translate('popup.video.postRecordActionError')))
      .finally(() => {
        isBusyRef.current = false;
        setIsBusy(false);
      });
  };
  const decide = (action: () => Promise<void>, closeAfter = false) =>
    run(async () => {
      await action();
      await onAcknowledge();
      if (closeAfter) window.close();
    });

  return (
    <main ref={panel} className={POST_RECORD_MAIN_CLASS} data-ui="camera-recorder.result">
      <section className={POST_RECORD_PANEL_CLASS} aria-labelledby="camera-recorder-result-title">
        <div className="text-center">
          <h1 id="camera-recorder-result-title" className="m-0 text-[14px] leading-5 font-medium">
            {translate('popup.video.postRecordTitle')}
          </h1>
          <div className="mt-1 text-[14px] leading-5 font-normal text-[var(--sniptale-color-text-muted-strong)]">
            {translate('popup.video.postRecordDescription')}
          </div>
        </div>
        <CameraPostRecordActions
          isBusy={isBusy}
          result={result}
          decide={decide}
          onDelete={() => setDeleteConfirmOpen(true)}
        />
        {error ? (
          <div
            role="alert"
            className="select-text text-[14px] leading-5 font-normal
            [overflow-wrap:anywhere] text-[var(--sniptale-color-danger)]"
          >
            {error}
          </div>
        ) : null}
      </section>
      {deleteConfirmOpen ? (
        <ProductConfirmDialog
          title={translate('popup.video.postRecordDeleteTitle')}
          message={translate('popup.video.postRecordDeleteMessage')}
          cancelText={translate('common.actions.cancel')}
          confirmText={translate('popup.video.postRecordDelete')}
          onCancel={() => setDeleteConfirmOpen(false)}
          onConfirm={() => {
            setDeleteConfirmOpen(false);
            decide(() => deleteVideoPostRecordResult(result), true);
          }}
        />
      ) : null}
    </main>
  );
}

function CameraPostRecordActions(props: {
  decide: (action: () => Promise<void>, closeAfter?: boolean) => void;
  isBusy: boolean;
  result: VideoPostRecordResult;
  onDelete(): void;
}) {
  return (
    <div className="flex flex-col gap-3" aria-busy={props.isBusy}>
      <div className="grid grid-cols-2 gap-2">
        <CameraPostRecordOpenButton
          icon={Film}
          disabled={props.isBusy}
          label={translate('popup.video.postRecordOpenEditor')}
          onClick={() => props.decide(() => openSavedRecordingInVideoEditor(props.result), true)}
        />
        <CameraPostRecordOpenButton
          icon={Library}
          disabled={props.isBusy}
          label={translate('popup.video.postRecordOpenGallery')}
          onClick={() =>
            props.decide(() => openLatestRecordingInGallery(props.result.primaryRecordingId), true)
          }
        />
      </div>
      <ProductActionButton
        tone="secondary"
        compact
        disabled={props.isBusy}
        onClick={() =>
          props.decide(() => downloadSavedRecordingTracks(props.result.recordingId), true)
        }
      >
        <Download className="size-4 shrink-0" aria-hidden="true" />
        {translate('popup.video.postRecordDownload')}
      </ProductActionButton>
      <div className="flex flex-wrap gap-2 pt-1">
        <ProductActionButton
          tone="secondary"
          compact
          className="grow basis-[220px]"
          disabled={props.isBusy}
          onClick={() => props.decide(() => Promise.resolve())}
        >
          {translate('popup.video.postRecordNext')}
        </ProductActionButton>
        <ProductActionButton
          tone="secondary"
          compact
          className="grow"
          disabled={props.isBusy}
          onClick={() => props.decide(() => Promise.resolve(), true)}
        >
          <X className="size-4 shrink-0" aria-hidden="true" />
          {translate('popup.video.postRecordClose')}
        </ProductActionButton>
      </div>
      <div className="grid border-t border-[var(--sniptale-color-border-soft)] pt-2">
        <ProductActionButton tone="danger" compact disabled={props.isBusy} onClick={props.onDelete}>
          <Trash2 className="size-4 shrink-0" aria-hidden="true" />
          {translate('popup.video.postRecordDelete')}
        </ProductActionButton>
      </div>
    </div>
  );
}

function CameraPostRecordOpenButton({
  icon: Icon,
  label,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  disabled: boolean;
  onClick(): void;
}) {
  const press = useCommandPress({ disabled, onClick });
  return (
    <button
      {...press.props}
      type="button"
      disabled={disabled}
      data-command-press=""
      data-pressing={press.pressed ? 'true' : undefined}
      className="group flex min-h-[88px] min-w-0 items-center justify-center rounded-[6px]
      bg-[var(--sniptale-color-surface-input)] px-2 py-3
      text-[var(--sniptale-color-text-primary)] transition-colors motion-reduce:transition-none
      hover:bg-[var(--sniptale-color-surface-hover)] disabled:cursor-not-allowed disabled:opacity-50
      focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sniptale-color-accent)]"
    >
      <span className="sniptale-command-content">
        <span className="flex min-w-0 flex-col items-center gap-2.5">
          <Icon
            className="size-6 shrink-0 text-[var(--sniptale-color-accent)]"
            aria-hidden="true"
          />
          <span className="text-balance text-center text-xs leading-4">{label}</span>
        </span>
      </span>
    </button>
  );
}
