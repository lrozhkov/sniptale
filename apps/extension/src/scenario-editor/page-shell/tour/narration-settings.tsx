import { useEffect, useRef, useState } from 'react';
import { Mic, Upload, Trash2 } from 'lucide-react';
import type { TourNarration, TourSlide } from '@sniptale/runtime-contracts/scenario/types/tour';
import type { importScenarioNarration } from '../../../composition/persistence/scenario/store/public';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { NumericRow } from '../../../ui/compact-inspector-controls/numeric';
import { GuideInspectorGroup } from '../inspector';
import { TourTextField } from './fields';
import { TourNarrationPreview } from './narration-preview';
import { TourNarrationRecording } from './narration-recording';
import type { Translate } from '../../../platform/i18n';

type ImportInput = Omit<Parameters<typeof importScenarioNarration>[0], 'project' | 'baseUpdatedAt'>;
/** Asset acquisition uses the page mutation; authored narration fields use existing slide history. */
export function TourNarrationSettings({
  slide,
  disabled,
  importDisabled,
  onImport,
  onChange,
  t,
}: {
  slide: TourSlide;
  disabled: boolean;
  importDisabled: boolean;
  onImport: (input: ImportInput) => Promise<boolean>;
  onChange: (slide: TourSlide, group?: string | null) => boolean;
  t: Translate;
}) {
  const [recording, setRecording] = useState<{ expected: TourNarration | null } | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);
  const upload = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => () => upload.current?.abort(), []);
  const apply = async (blob: Blob, signal: AbortSignal, expected: TourNarration | null) => {
    if (busy.current || importDisabled || signal.aborted) return false;
    busy.current = true;
    setPending(true);
    setFailed(false);
    try {
      const accepted = await onImport({
        slideId: slide.id,
        expectedNarration: expected,
        blob,
        signal,
      });
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
  const narration = slide.narration;
  const change = (patch: Partial<TourNarration>) => {
    if (narration)
      onChange({ ...slide, narration: { ...narration, ...patch } }, `narration:${slide.id}`);
  };
  const locked = disabled || pending;
  return (
    <GuideInspectorGroup icon={Mic} title={t('scenario.editor.tourNarration')}>
      <div className="flex flex-wrap gap-2">
        <ProductActionButton
          compact
          tone="secondary"
          disabled={importDisabled || pending}
          onClick={() => setRecording({ expected: structuredClone(narration) })}
        >
          <Mic size={15} />
          {t('scenario.editor.tourRecord')}
        </ProductActionButton>
        <ProductActionButton
          compact
          tone="secondary"
          disabled={importDisabled || pending}
          onClick={() => input.current?.click()}
        >
          <Upload size={15} />
          {t('scenario.editor.tourAudioUpload')}
        </ProductActionButton>
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
            void apply(file, operation.signal, structuredClone(narration));
          }}
        />
      </div>
      {!narration && <p className="guide-inspector-hint">{t('scenario.editor.tourAudioHint')}</p>}
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
      {narration && (
        <>
          <TourNarrationPreview key={narration.assetId} narration={narration} t={t} />
          <NarrationFields narration={narration} locked={locked} change={change} t={t} />
          <ProductActionButton
            compact
            tone="secondary"
            disabled={locked}
            onClick={() => onChange({ ...slide, narration: null })}
          >
            <Trash2 size={15} />
            {t('scenario.editor.tourAudioRemove')}
          </ProductActionButton>
        </>
      )}
      {recording && (
        <TourNarrationRecording
          t={t}
          onClose={() => setRecording(null)}
          onApply={(blob, signal) => apply(blob, signal, recording.expected)}
        />
      )}
    </GuideInspectorGroup>
  );
}

function NarrationFields({
  narration,
  locked,
  change,
  t,
}: {
  narration: TourNarration;
  locked: boolean;
  change: (patch: Partial<TourNarration>) => void;
  t: Translate;
}) {
  return (
    <>
      <NumericRow
        label={t('scenario.editor.tourAudioStart')}
        value={narration.trimStart}
        min={0}
        max={narration.trimEnd - Math.min(0.01, narration.duration / 2)}
        step={0.1}
        precision={2}
        disabled={locked}
        onPreviewValue={(trimStart) => change({ trimStart })}
        onCommitValue={(trimStart) => change({ trimStart })}
      />
      <NumericRow
        label={t('scenario.editor.tourAudioEnd')}
        value={narration.trimEnd}
        min={narration.trimStart + Math.min(0.01, narration.duration / 2)}
        max={narration.duration}
        step={0.1}
        precision={2}
        disabled={locked}
        onPreviewValue={(trimEnd) => change({ trimEnd })}
        onCommitValue={(trimEnd) => change({ trimEnd })}
      />
      <NumericRow
        label={t('scenario.editor.tourAudioGain')}
        value={narration.gain * 100}
        min={0}
        max={200}
        step={5}
        unit="%"
        disabled={locked}
        onPreviewValue={(value) => change({ gain: value / 100 })}
        onCommitValue={(value) => change({ gain: value / 100 })}
      />
      <TourTextField
        label={t('scenario.editor.tourAudioTranscript')}
        value={narration.transcript}
        disabled={locked}
        onChange={(transcript) => change({ transcript })}
      />
    </>
  );
}
