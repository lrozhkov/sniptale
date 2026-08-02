import { Download, Film, Images, Trash2, X } from 'lucide-react';
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
  'flex h-screen items-center justify-center',
  'bg-[var(--sniptale-color-surface-canvas)] p-5 text-[var(--sniptale-color-text-primary)]',
].join(' ');

const POST_RECORD_PANEL_CLASS = [
  'flex w-full max-w-[520px] flex-col gap-3 rounded-[18px]',
  'border border-[var(--sniptale-color-border-soft)]',
  'bg-[var(--sniptale-color-surface-panel)] p-5',
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
    <main className={POST_RECORD_MAIN_CLASS}>
      <section className={POST_RECORD_PANEL_CLASS}>
        <div className="text-center">
          <div className="text-lg font-semibold">{translate('popup.video.postRecordTitle')}</div>
          <div className="mt-1 text-sm text-[var(--sniptale-color-text-muted-strong)]">
            {translate('popup.video.postRecordDescription')}
          </div>
        </div>
        <CameraPostRecordActions isBusy={isBusy} result={result} decide={decide} />
        {error ? <div className="text-sm text-[var(--sniptale-color-danger)]">{error}</div> : null}
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
        icon={Film}
        disabled={props.isBusy}
        label={translate('popup.video.postRecordOpenEditor')}
        onClick={() => props.decide(() => openSavedRecordingInVideoEditor(props.result), true)}
      />
      <CameraWindowButton
        icon={Images}
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
