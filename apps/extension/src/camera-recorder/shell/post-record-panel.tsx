import { Download, Film, Library, Trash2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import type { VideoPostRecordResult } from '@sniptale/runtime-contracts/video/types/types';
import { translate } from '../../platform/i18n';
import { CameraWindowButton } from './button';
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
  'my-auto flex w-full max-w-[520px] shrink-0 flex-col gap-3 rounded-[4px]',
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
    <main className={POST_RECORD_MAIN_CLASS} data-ui="camera-recorder.result">
      <section className={POST_RECORD_PANEL_CLASS} aria-labelledby="camera-recorder-result-title">
        <div className="text-center">
          <h1 id="camera-recorder-result-title" className="m-0 text-[14px] leading-5 font-medium">
            {translate('popup.video.postRecordTitle')}
          </h1>
          <div className="mt-1 text-[14px] leading-5 font-normal text-[var(--sniptale-color-text-muted-strong)]">
            {translate('popup.video.postRecordDescription')}
          </div>
        </div>
        <CameraPostRecordActions isBusy={isBusy} result={result} decide={decide} />
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
    </main>
  );
}

function CameraPostRecordActions(props: {
  decide: (action: () => Promise<void>, closeAfter?: boolean) => void;
  isBusy: boolean;
  result: VideoPostRecordResult;
}) {
  return (
    <>
      <CameraWindowButton
        disabled={props.isBusy}
        label={translate('popup.video.postRecordNext')}
        onClick={() => props.decide(() => Promise.resolve())}
      />
      <CameraWindowButton
        icon={Film}
        disabled={props.isBusy}
        label={translate('popup.video.postRecordOpenEditor')}
        onClick={() => props.decide(() => openSavedRecordingInVideoEditor(props.result), true)}
      />
      <CameraWindowButton
        icon={Library}
        disabled={props.isBusy}
        label={translate('popup.video.postRecordOpenGallery')}
        onClick={() =>
          props.decide(() => openLatestRecordingInGallery(props.result.primaryRecordingId), true)
        }
      />
      <CameraWindowButton
        icon={Download}
        disabled={props.isBusy}
        label={translate('popup.video.postRecordDownload')}
        onClick={() =>
          props.decide(() => downloadSavedRecordingTracks(props.result.recordingId), true)
        }
      />
      <CameraWindowButton
        icon={X}
        disabled={props.isBusy}
        label={translate('popup.video.postRecordClose')}
        onClick={() => props.decide(() => Promise.resolve(), true)}
      />
      <CameraWindowButton
        icon={Trash2}
        disabled={props.isBusy}
        label={translate('popup.video.postRecordDelete')}
        tone="danger"
        onClick={() => confirmDelete(props.result, props.decide)}
      />
    </>
  );
}

function confirmDelete(
  result: VideoPostRecordResult,
  decide: (action: () => Promise<void>, closeAfter?: boolean) => void
): void {
  if (window.confirm(translate('popup.video.postRecordDeleteConfirm'))) {
    decide(() => deleteVideoPostRecordResult(result), true);
  }
}
