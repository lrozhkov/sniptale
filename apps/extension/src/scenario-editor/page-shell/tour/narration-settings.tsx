import { useState } from 'react';
import { Mic, FolderOpen, Unlink } from 'lucide-react';
import type {
  TourAudioResource,
  TourNarration,
  TourObjectNarration,
  TourSlide,
} from '@sniptale/runtime-contracts/scenario/types/tour';
import type { importScenarioNarration } from '../../../composition/persistence/scenario/store/public';
import { getTourNarrationTarget } from '../../../features/scenario/project/public';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { NumericRow } from '../../../ui/compact-inspector-controls/numeric';
import { CompactSelect } from '../../../ui/compact-inspector-controls/select';
import { GuideInspectorGroup } from '../inspector';
import { TourTextField } from './fields';
import { TourNarrationPreview } from './narration-preview';
import { TourNarrationAcquisition } from './narration-acquisition';
import { TourAudioPicker, materialNarration } from './audio-materials';
import type { Translate } from '../../../platform/i18n';

type ImportInput = Omit<Parameters<typeof importScenarioNarration>[0], 'project' | 'baseUpdatedAt'>;
/** Binding edits affect only the selected target; audio material lifetime belongs to project resources. */
export function TourNarrationSettings({
  slide,
  objectId = null,
  resources = [],
  disabled,
  importDisabled,
  onImport,
  onChange,
  t,
}: {
  slide: TourSlide;
  objectId?: string | null;
  resources?: TourAudioResource[];
  disabled: boolean;
  importDisabled: boolean;
  onImport: (input: ImportInput) => Promise<boolean>;
  onChange: (slide: TourSlide, group?: string | null) => boolean;
  t: Translate;
}) {
  const [choosing, setChoosing] = useState(false);
  const target = getTourNarrationTarget(slide, objectId);
  if (!target) return null;
  const narration = target.narration ?? null;
  const trigger =
    narration && 'trigger' in narration && narration.trigger === 'enter' ? 'enter' : 'activation';
  const update = (value: TourNarration | TourObjectNarration | null, group?: string) => {
    const next = structuredClone(slide);
    const destination = getTourNarrationTarget(next, objectId);
    if (!destination) return false;
    destination.narration = value;
    return onChange(next, group);
  };
  const change = (patch: Partial<TourObjectNarration>) => {
    if (narration)
      update({ ...narration, ...patch }, `narration:${slide.id}${objectId ? `:${objectId}` : ''}`);
  };
  const title = t(
    objectId ? 'scenario.editor.tourObjectNarration' : 'scenario.editor.tourSlideNarration'
  );
  return (
    <GuideInspectorGroup icon={Mic} title={title}>
      {narration && (
        <>
          <div className="tour-audio-binding">
            <span title={resources.find((r) => r.assetId === narration.assetId)?.name}>
              {resources.find((r) => r.assetId === narration.assetId)?.name ||
                t('scenario.editor.tourNarration')}
            </span>
            <ContentToolbarButton
              title={t('scenario.editor.tourAudioRemove')}
              disabled={disabled}
              onClick={() => update(null)}
            >
              <Unlink size={15} />
            </ContentToolbarButton>
          </div>
          <TourNarrationPreview key={narration.assetId} narration={narration} t={t} />
        </>
      )}
      <TourNarrationAcquisition
        destination={{ slideId: slide.id, objectId, expectedNarration: narration }}
        disabled={importDisabled}
        onImport={onImport}
        t={t}
      >
        <ProductActionButton
          compact
          tone="secondary"
          disabled={disabled || !resources.length}
          aria-expanded={choosing}
          onClick={() => setChoosing(!choosing)}
        >
          <FolderOpen size={15} />
          {t('scenario.editor.tourAudioChoose')}
        </ProductActionButton>
      </TourNarrationAcquisition>
      {choosing && (
        <TourAudioPicker
          resources={resources}
          disabled={disabled}
          t={t}
          onChoose={(resource) => {
            const voice = materialNarration(resource);
            const value = objectId
              ? {
                  ...voice,
                  trigger,
                }
              : voice;
            if (update(value)) setChoosing(false);
          }}
        />
      )}
      {!narration && <p className="guide-inspector-hint">{t('scenario.editor.tourAudioHint')}</p>}
      {narration && (
        <>
          {objectId ? (
            <div className="tour-text-field">
              <span>{t('scenario.editor.tourAudioTrigger')}</span>
              <CompactSelect
                aria-label={t('scenario.editor.tourAudioTrigger')}
                disabled={disabled}
                value={trigger}
                options={[
                  { value: 'activation', label: t('scenario.editor.tourAudioOnActivation') },
                  { value: 'enter', label: t('scenario.editor.tourAudioOnEnter') },
                ]}
                onChange={(value) => {
                  if (value === 'activation' || value === 'enter') change({ trigger: value });
                }}
              />
            </div>
          ) : (
            <p className="guide-inspector-hint">{t('scenario.editor.tourAudioSlideHint')}</p>
          )}
          <NarrationFields narration={narration} locked={disabled} change={change} t={t} />
        </>
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
