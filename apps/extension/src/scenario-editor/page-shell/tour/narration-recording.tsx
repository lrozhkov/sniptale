import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  resolveThemeSafePortalTarget,
  useResolvedPortalTheme,
} from '@sniptale/ui/theme/safe-portal';
import { Mic, Square, Play, Pause } from 'lucide-react';
import {
  ProductModal,
  ProductModalHeader,
  ProductModalBody,
  ProductModalFooter,
} from '@sniptale/ui/product-modal';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { useAudioRecordingSession } from '../../../composition/audio-recording/session';
import { useAudioRecordingFocus } from '../../../composition/audio-recording/dialog-focus';
import { createTrimmedRecordingFile } from '../../../composition/audio-recording/trim-file';
import { NumericRow } from '../../../ui/compact-inspector-controls/numeric';
import type { Translate } from '../../../platform/i18n';

const limit = { startTime: 0, duration: 3600, beforeStart: async () => {}, onStop: () => {} };
/** Recording is a local draft until the source-bound page import has committed it. */
export function TourNarrationRecording({
  t,
  onClose,
  onApply,
}: {
  t: Translate;
  onClose: () => void;
  onApply: (blob: Blob, signal: AbortSignal) => Promise<boolean>;
}) {
  const session = useAudioRecordingSession(
    true,
    {
      noSupport: t('scenario.editor.tourRecordUnsupported'),
      permissionDenied: t('scenario.editor.tourRecordDenied'),
      startFailed: t('scenario.editor.tourRecordFailed'),
      playFailed: t('scenario.editor.tourAudioFailed'),
    },
    '',
    limit
  );
  const [lifetime] = useState(() => new AbortController());
  const [busy, setBusy] = useState<'start' | 'save' | null>(null);
  const gate = useRef(false);
  const [error, setError] = useState(false);
  useEffect(() => () => lifetime.abort(), [lifetime]);
  const start = async () => {
    if (gate.current) return;
    gate.current = true;
    setBusy('start');
    setError(false);
    try {
      await session.transport.startRecording();
    } finally {
      gate.current = false;
      if (!lifetime.signal.aborted) setBusy(null);
    }
  };
  const save = async () => {
    if (gate.current || !session.save.audioBlob) return;
    gate.current = true;
    setBusy('save');
    setError(false);
    session.trim?.pauseSelection();
    try {
      const file = await createTrimmedRecordingFile(
        session.save.audioBlob,
        session.save.trimStart,
        session.save.trimEnd
      );
      lifetime.signal.throwIfAborted();
      const accepted = await onApply(file, lifetime.signal);
      if (!lifetime.signal.aborted) {
        if (accepted) onClose();
        else setError(true);
      }
    } catch {
      if (!lifetime.signal.aborted) setError(true);
    } finally {
      gate.current = false;
      if (!lifetime.signal.aborted) setBusy(null);
    }
  };
  const close = () => {
    if (busy !== 'save') onClose();
  };
  const recording = session.transport.status === 'recording';
  return (
    <NarrationDialog t={t} disabled={busy === 'save'} onClose={close}>
      <ProductModalBody compact>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm tabular-nums" role="status">
              {session.transport.durationLabel}
            </span>
            <ProductActionButton
              compact
              tone={recording ? 'primary' : 'secondary'}
              disabled={busy !== null}
              onClick={() => (recording ? session.transport.stopRecording() : void start())}
            >
              {recording ? <Square size={15} /> : <Mic size={15} />}
              {t(
                recording
                  ? 'scenario.editor.tourRecordStop'
                  : session.trim
                    ? 'scenario.editor.tourRecordAgain'
                    : 'scenario.editor.tourRecordStart'
              )}
            </ProductActionButton>
          </div>
          {session.trim && <RecordingTrim session={session} disabled={busy !== null} t={t} />}
          {(session.transport.error || error) && (
            <p role="alert" className="guide-inspector-hint">
              {session.transport.error || t('scenario.editor.tourAudioSaveFailed')}
            </p>
          )}
        </div>
      </ProductModalBody>
      <ProductModalFooter compact>
        <ProductActionButton compact tone="secondary" disabled={busy === 'save'} onClick={close}>
          {t('common.actions.cancel')}
        </ProductActionButton>
        <ProductActionButton
          compact
          disabled={busy !== null || !session.trim}
          onClick={() => void save()}
        >
          {t('scenario.editor.tourAudioApply')}
        </ProductActionButton>
      </ProductModalFooter>
    </NarrationDialog>
  );
}
function NarrationDialog({
  t,
  disabled,
  onClose,
  children,
}: {
  t: Translate;
  disabled: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const [opener] = useState(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement : null
  );
  const theme = useResolvedPortalTheme(opener);
  const { titleId, handleKeyDown } = useAudioRecordingFocus(true);
  return createPortal(
    <div data-theme={theme ?? undefined}>
      <ProductModal
        labelledBy={titleId}
        width="min(480px, calc(100vw - 24px))"
        maxHeight="calc(100vh - 24px)"
        onClose={onClose}
        closeOnBackdrop={false}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
          } else handleKeyDown(event);
        }}
      >
        <ProductModalHeader
          compact
          title={<span id={titleId}>{t('scenario.editor.tourRecordAudio')}</span>}
          onClose={onClose}
          disabled={disabled}
          closeTitle={t('scenario.editor.close')}
        />
        {children}
      </ProductModal>
    </div>,
    resolveThemeSafePortalTarget(opener)
  );
}

function RecordingTrim({
  session,
  disabled,
  t,
}: {
  session: ReturnType<typeof useAudioRecordingSession>;
  disabled: boolean;
  t: Translate;
}) {
  const trim = session.trim!;
  const change = (start: number, end: number) => trim.selectRange({ start, end });
  return (
    <>
      <audio
        ref={trim.audioRef}
        src={trim.audioUrl}
        preload="auto"
        onLoadedMetadata={(event) => trim.resolveDuration(event.currentTarget.duration)}
      />
      <ProductActionButton
        compact
        tone="secondary"
        disabled={disabled}
        onClick={() =>
          trim.isPlayingSelection ? trim.pauseSelection() : void trim.playSelection()
        }
      >
        {trim.isPlayingSelection ? <Pause size={15} /> : <Play size={15} />}
        {t(trim.isPlayingSelection ? 'scenario.editor.tourPause' : 'scenario.editor.tourPlay')}
      </ProductActionButton>
      <NumericRow
        label={t('scenario.editor.tourAudioStart')}
        value={trim.trimStart}
        min={0}
        max={Math.max(0, trim.trimEnd - 0.01)}
        precision={2}
        step={0.1}
        disabled={disabled}
        onPreviewValue={(start) => change(start, trim.trimEnd)}
        onCommitValue={(start) => change(start, trim.trimEnd)}
      />
      <NumericRow
        label={t('scenario.editor.tourAudioEnd')}
        value={trim.trimEnd}
        min={trim.trimStart + 0.01}
        max={trim.recordedDuration}
        precision={2}
        step={0.1}
        disabled={disabled}
        onPreviewValue={(end) => change(trim.trimStart, end)}
        onCommitValue={(end) => change(trim.trimStart, end)}
      />
    </>
  );
}
