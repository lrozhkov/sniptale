import { Download, Film, Images, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { openGalleryPage, openVideoEditorPage } from '../../platform/navigation/extension-pages';
import { translate } from '../../platform/i18n';
import { deleteSavedRecordingTracks } from '../../composition/persistence/recordings/tracks';
import { CameraWindowButton } from './button';
import { downloadSavedRecordingTracks } from './download';

const POST_RECORD_MAIN_CLASS = [
  'flex h-screen items-center justify-center',
  'bg-[var(--sniptale-color-surface-canvas)] p-5 text-[var(--sniptale-color-text-primary)]',
].join(' ');

const POST_RECORD_PANEL_CLASS = [
  'flex w-full max-w-[520px] flex-col gap-3 rounded-[18px]',
  'border border-[var(--sniptale-color-border-soft)]',
  'bg-[var(--sniptale-color-surface-panel)] p-5',
].join(' ');

export function CameraPostRecordPanel({ recordingId }: { recordingId: string }) {
  const [error, setError] = useState<string | null>(null);
  const run = (action: () => Promise<void>) => {
    setError(null);
    void action().catch(() => setError(translate('popup.video.postRecordActionError')));
  };

  return (
    <main className={POST_RECORD_MAIN_CLASS}>
      <section className={POST_RECORD_PANEL_CLASS}>
        <div className="text-center">
          <div className="text-lg font-semibold">{translate('popup.video.postRecordTitle')}</div>
          <div className="mt-1 text-sm text-[var(--sniptale-color-text-muted-strong)]">
            {translate('popup.video.postRecordDescription')}
          </div>
        </div>
        <CameraPostRecordActions recordingId={recordingId} run={run} />
        {error ? <div className="text-sm text-[var(--sniptale-color-danger)]">{error}</div> : null}
      </section>
    </main>
  );
}

function CameraPostRecordActions(props: {
  recordingId: string;
  run: (action: () => Promise<void>) => void;
}) {
  return (
    <>
      <CameraWindowButton
        icon={Film}
        label={translate('popup.video.postRecordOpenEditor')}
        onClick={() => props.run(() => openVideoEditorPage(null, props.recordingId).then(close))}
      />
      <CameraWindowButton
        icon={Images}
        label={translate('popup.video.postRecordOpenGallery')}
        onClick={() =>
          props.run(() => openGalleryPage({ recordingId: props.recordingId }).then(close))
        }
      />
      <CameraWindowButton
        icon={Download}
        label={translate('popup.video.postRecordDownload')}
        onClick={() => props.run(() => downloadSavedRecordingTracks(props.recordingId))}
      />
      <CameraWindowButton
        icon={X}
        label={translate('popup.video.postRecordClose')}
        onClick={() => window.close()}
      />
      <CameraWindowButton
        icon={Trash2}
        label={translate('popup.video.postRecordDelete')}
        tone="danger"
        onClick={() => confirmDelete(props.recordingId, props.run)}
      />
    </>
  );
}

function close(): void {
  window.close();
}

function confirmDelete(recordingId: string, run: (action: () => Promise<void>) => void): void {
  if (window.confirm(translate('popup.video.postRecordDeleteConfirm'))) {
    run(() => deleteSavedRecordingTracks(recordingId).then(close));
  }
}
