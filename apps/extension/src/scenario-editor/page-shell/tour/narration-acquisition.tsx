import { useEffect, useRef, useState, type ReactNode } from 'react';
import { GuideActionMenu } from '../action-menu';
import { FolderOpen, Mic, Upload, Plus } from 'lucide-react';
import type { importScenarioNarration } from '../../../composition/persistence/scenario/store/public';
import type { Translate } from '../../../platform/i18n';
import { ScenarioInspectorActionButton } from '../inspector-actions';
import { TourNarrationRecording } from './narration-recording';
import { TourAudioPicker } from './audio-materials';
import type { TourAudioResource } from '@sniptale/runtime-contracts/scenario/types/tour';

type ImportInput = Omit<Parameters<typeof importScenarioNarration>[0], 'project' | 'baseUpdatedAt'>;
type NarrationDestination = Pick<
  ImportInput,
  'slideId' | 'objectId' | 'expectedNarration' | 'destination'
>;

type AudioCatalog = {
  resources: TourAudioResource[];
  disabled: boolean;
  onChoose: (resource: TourAudioResource) => boolean;
};

/** Shared acquisition UI captures one immutable destination; persistence stays with the page. */
export function TourNarrationAcquisition({
  menu = false,
  uploadOnly = false,
  destination,
  disabled,
  onImport,
  t,
  children,
  catalog,
}: {
  menu?: boolean;
  uploadOnly?: boolean;
  destination: NarrationDestination;
  disabled: boolean;
  onImport: (input: ImportInput) => Promise<boolean>;
  t: Translate;
  children?: ReactNode;
  catalog?: AudioCatalog;
}) {
  const [choosing, setChoosing] = useState(false);
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
      <fieldset
        disabled={disabled || pending}
        className="tour-audio-acquisition"
        data-acquisition-menu={menu || undefined}
      >
        <AcquisitionButtons
          menu={menu}
          uploadOnly={uploadOnly}
          disabled={disabled || pending}
          onRecord={() => setRecording(structuredClone(destination))}
          onUpload={() => input.current?.click()}
          t={t}
        />
        {catalog && (
          <ScenarioInspectorActionButton
            disabled={catalog.disabled || !catalog.resources.length}
            aria-expanded={choosing}
            onClick={() => setChoosing(!choosing)}
          >
            <FolderOpen size={15} />
            {t('scenario.editor.tourAudioChoose')}
          </ScenarioInspectorActionButton>
        )}
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
      {choosing && catalog && (
        <TourAudioPicker
          resources={catalog.resources}
          disabled={catalog.disabled}
          t={t}
          onChoose={(resource) => {
            if (catalog.onChoose(resource)) setChoosing(false);
          }}
        />
      )}
    </>
  );
}

/** Upload and recording entry controls share one presentation while acquisition owns their lifetime. */
function AcquisitionButtons({
  menu,
  uploadOnly,
  disabled,
  onRecord,
  onUpload,
  t,
}: {
  menu: boolean;
  uploadOnly: boolean;
  disabled: boolean;
  onRecord: () => void;
  onUpload: () => void;
  t: Translate;
}) {
  return menu ? (
    <GuideActionMenu
      label={t('scenario.editor.tourAudioResources')}
      icon={<Plus size={16} aria-hidden="true" />}
      disabled={disabled}
      items={[
        ...(!uploadOnly
          ? [
              {
                label: t('scenario.editor.tourRecord'),
                icon: <Mic size={15} />,
                onSelect: onRecord,
              },
            ]
          : []),
        {
          label: t('scenario.editor.tourAudioUpload'),
          icon: <Upload size={15} />,
          onSelect: onUpload,
        },
      ]}
    />
  ) : (
    <>
      {!uploadOnly && (
        <ScenarioInspectorActionButton disabled={disabled} onClick={onRecord}>
          <Mic size={15} />
          {t('scenario.editor.tourRecord')}
        </ScenarioInspectorActionButton>
      )}
      <ScenarioInspectorActionButton disabled={disabled} onClick={onUpload}>
        <Upload size={15} />
        {t('scenario.editor.tourAudioUpload')}
      </ScenarioInspectorActionButton>
    </>
  );
}
