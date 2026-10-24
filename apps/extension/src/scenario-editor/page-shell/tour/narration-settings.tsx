import { AudioLines, Unlink } from 'lucide-react';
import type {
  TourAudioResource,
  TourNarration,
  TourObjectNarration,
  TourSlide,
} from '@sniptale/runtime-contracts/scenario/types/tour';
import type { importScenarioNarration } from '../../../composition/persistence/scenario/store/public';
import { getTourNarrationTarget } from '../../../features/scenario/project/public';
import { ScenarioInspectorActionButton } from '../inspector-actions';
import { TourInspectorNumericRow } from './numeric-row';
import { GuideInspectorGroup } from '../inspector';
import { TourTextField } from './fields';
import { TourNarrationPreview } from './narration-preview';
import { TourNarrationAcquisition } from './narration-acquisition';
import { materialNarration } from './audio-materials';
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
  onGenerate,
  onChange,
  t,
}: {
  slide: TourSlide;
  objectId?: string | null;
  resources?: TourAudioResource[];
  disabled: boolean;
  importDisabled: boolean;
  onImport: (input: ImportInput) => Promise<boolean>;
  onGenerate?: (() => void) | undefined;
  onChange: (slide: TourSlide, group?: string | null) => boolean;
  t: Translate;
}) {
  const target = getTourNarrationTarget(slide, objectId);
  if (!target) return null;
  const narration = target.narration ?? null;
  const trigger = 'enter' as const;
  const update = (value: TourNarration | TourObjectNarration | null, group?: string) => {
    const next = structuredClone(slide);
    const destination = getTourNarrationTarget(next, objectId);
    if (!destination) return false;
    destination.narration = value;
    return onChange(next, group);
  };
  const change = (patch: Partial<TourObjectNarration>) => {
    if (narration)
      return update(
        { ...narration, ...patch },
        `narration:${slide.id}${objectId ? `:${objectId}` : ''}`
      );
    return false;
  };
  const title = t(
    objectId ? 'scenario.editor.tourObjectNarration' : 'scenario.editor.tourSlideNarration'
  );
  return (
    <GuideInspectorGroup id="narration" icon={AudioLines} title={title}>
      {onGenerate && (
        <ScenarioInspectorActionButton
          disabled={importDisabled}
          data-ai-single
          onClick={onGenerate}
        >
          {t('scenario.editor.tourNarrationAI')}
        </ScenarioInspectorActionButton>
      )}
      {narration && (
        <>
          <div className="tour-audio-binding">
            <span title={resources.find((r) => r.assetId === narration.assetId)?.name}>
              {resources.find((r) => r.assetId === narration.assetId)?.name ||
                t('scenario.editor.tourNarration')}
            </span>
            <ScenarioInspectorActionButton
              tone="danger"
              layout="icon"
              title={t('scenario.editor.tourAudioRemove')}
              disabled={disabled}
              onClick={() => update(null)}
            >
              <Unlink size={15} />
            </ScenarioInspectorActionButton>
          </div>
          <TourNarrationPreview
            key={narration.assetId}
            narration={narration}
            disabled={disabled}
            onTrimChange={change}
            t={t}
          />
        </>
      )}
      <TourNarrationAcquisition
        destination={{ slideId: slide.id, objectId, expectedNarration: narration }}
        disabled={importDisabled}
        onImport={onImport}
        t={t}
        catalog={{
          resources,
          disabled,
          onChoose: (resource) => {
            const voice = materialNarration(resource);
            return update(objectId ? { ...voice, trigger } : voice);
          },
        }}
      />
      {narration && (
        <>
          <p className="guide-inspector-hint">{t('scenario.editor.tourAudioSlideHint')}</p>
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
      <TourInspectorNumericRow
        label={t('scenario.editor.tourAudioGain')}
        value={narration.gain * 100}
        min={0}
        max={200}
        step={5}
        unit="%"
        disabled={locked}
        onPreview={(value) => change({ gain: value / 100 })}
        onChange={(value) => change({ gain: value / 100 })}
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
