import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Mic, Upload } from 'lucide-react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import type { importScenarioNarration } from '../../../composition/persistence/scenario/store/public';
import type { Translate } from '../../../platform/i18n';
import { TourNarrationRecording } from './narration-recording';

type ImportInput = Omit<Parameters<typeof importScenarioNarration>[0], 'project' | 'baseUpdatedAt'>;
type NarrationDestination = Pick<ImportInput, 'slideId' | 'objectId' | 'expectedNarration'>;

/** Shared acquisition UI captures one immutable destination; persistence stays with the page. */
export function TourNarrationAcquisition({
  destination,
  disabled,
  onImport,
  t,
  children,
}: {
  destination: NarrationDestination;
  disabled: boolean;
  onImport: (input: ImportInput) => Promise<boolean>;
  t: Translate;
  children?: ReactNode;
}) {
  const [recording, setRecording] = useState<NarrationDestination | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);
  const upload = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => () => upload.current?.abort(), []);
  const apply = async (blob: Blob, signal: AbortSignal, target: NarrationDestination) => {
    if (busy.current || disabled || signal.aborted) return false;
    busy.current = true;
    setPending(true);
    setFailed(false);
    try {
      const accepted = await onImport({ ...target, blob, signal });
      if (!signal.aborted) setFailed(!accepted);
      return accepted;
    } catch {
      if (!signal.aborted) setFailed(true);
      return false;
    } finally {
      busy.current = false;
      if (!signal.aborted) setPending(false);
    }
  };
  return (
    <>
      <fieldset disabled={disabled || pending} className="tour-audio-acquisition">
        <ProductActionButton
          compact
          tone="secondary"
          disabled={disabled || pending}
          onClick={() => setRecording(structuredClone(destination))}
        >
          <Mic size={15} />
          {t('scenario.editor.tourRecord')}
        </ProductActionButton>
        <ProductActionButton
          compact
          tone="secondary"
          disabled={disabled || pending}
          onClick={() => input.current?.click()}
        >
          <Upload size={15} />
          {t('scenario.editor.tourAudioUpload')}
        </ProductActionButton>
        {children}
        <input
          ref={input}
          type="file"
          hidden
          accept="audio/webm,audio/ogg,audio/mp4,audio/mpeg,audio/wav,audio/x-wav"
          aria-label={t('scenario.editor.tourAudioUpload')}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (!file) return;
            upload.current?.abort();
            const operation = new AbortController();
            upload.current = operation;
            void apply(file, operation.signal, structuredClone(destination));
          }}
        />
      </fieldset>
      {pending && (
        <p role="status" className="guide-inspector-hint">
          {t('scenario.editor.tourAudioLoading')}
        </p>
      )}
      {failed && (
        <p role="alert" className="guide-inspector-hint">
          {t('scenario.editor.tourAudioImportFailed')}
        </p>
      )}
      {recording && (
        <TourNarrationRecording
          t={t}
          saveLabel={
            destination.slideId === null
              ? t('scenario.editor.tourAudioSaveResource')
              : t('scenario.editor.tourAudioApply')
          }
          onClose={() => setRecording(null)}
          onApply={(blob, signal) => apply(blob, signal, recording)}
        />
      )}
    </>
  );
}
