import { useState } from 'react';
import { FolderOpen, Music2, Unlink } from 'lucide-react';
import { ProductToggle } from '@sniptale/ui/product-form-controls';
import {
  createTourBackgroundMusic,
  type TourDocument,
} from '@sniptale/runtime-contracts/scenario/types/tour';
import { getTourAudioResources } from '../../../features/scenario/project/public';
import type { importScenarioNarration } from '../../../composition/persistence/scenario/store/public';
import type { Translate } from '../../../platform/i18n';
import { GuideInspectorGroup } from '../inspector';
import { ScenarioInspectorActionButton } from '../inspector-actions';
import { TourAudioPicker } from './audio-materials';
import { TourNarrationAcquisition } from './narration-acquisition';
import { TourInspectorNumericRow } from './numeric-row';

/** Global music binding edits share catalog admission and the existing acquisition transaction. */
export function TourMusicSettings({
  tour,
  disabled,
  importDisabled,
  onChange,
  onImport,
  t,
}: {
  tour: TourDocument;
  disabled: boolean;
  importDisabled: boolean;
  onChange: (tour: TourDocument) => boolean;
  onImport: (
    input: Omit<Parameters<typeof importScenarioNarration>[0], 'project' | 'baseUpdatedAt'>
  ) => Promise<boolean>;
  t: Translate;
}) {
  const [choosing, setChoosing] = useState(false);
  const music = tour.backgroundMusic ?? null;
  const resources = getTourAudioResources(tour);
  const resource = resources.find((entry) => entry.assetId === music?.assetId);
  const change = (backgroundMusic: TourDocument['backgroundMusic']) =>
    onChange({ ...tour, backgroundMusic });
  return (
    <GuideInspectorGroup id="document:music" icon={Music2} title={t('scenario.editor.tourMusic')}>
      {music && (
        <div className="tour-audio-binding">
          <span className="guide-resource-name" title={resource?.name}>
            {resource?.name || t('scenario.editor.tourMusic')}
          </span>
          <ScenarioInspectorActionButton
            tone="danger"
            layout="icon"
            title={t('scenario.editor.tourMusicRemove')}
            disabled={disabled}
            onClick={() => change(null)}
          >
            <Unlink size={15} />
          </ScenarioInspectorActionButton>
        </div>
      )}
      <TourNarrationAcquisition
        uploadOnly
        destination={{
          slideId: null,
          objectId: null,
          expectedNarration: null,
          destination: { kind: 'background-music', expected: music },
        }}
        disabled={importDisabled}
        onImport={onImport}
        t={t}
      >
        <ScenarioInspectorActionButton
          disabled={disabled || !resources.length}
          aria-expanded={choosing}
          onClick={() => setChoosing(!choosing)}
        >
          <FolderOpen size={15} />
          {t('scenario.editor.tourAudioChoose')}
        </ScenarioInspectorActionButton>
      </TourNarrationAcquisition>
      {choosing && (
        <TourAudioPicker
          resources={resources}
          disabled={disabled}
          t={t}
          onChoose={(entry) => {
            const identity = { assetId: entry.assetId, duration: entry.duration };
            if (change(music ? { ...music, ...identity } : createTourBackgroundMusic(identity)))
              setChoosing(false);
          }}
        />
      )}
      {music && (
        <>
          <TourInspectorNumericRow
            label={t('scenario.editor.tourVolume')}
            value={music.volume * 100}
            min={0}
            max={100}
            unit="%"
            disabled={disabled}
            onChange={(value) => change({ ...music, volume: value / 100 })}
          />
          <label className="guide-number-toggle">
            <ProductToggle
              size="sm"
              disabled={disabled}
              checked={music.loop}
              aria-label={t('scenario.editor.tourMusicLoop')}
              onClick={() => change({ ...music, loop: !music.loop })}
            />
            {t('scenario.editor.tourMusicLoop')}
          </label>
          <label className="guide-number-toggle">
            <ProductToggle
              size="sm"
              disabled={disabled}
              checked={music.ducking.enabled}
              aria-label={t('scenario.editor.tourMusicDucking')}
              onClick={() =>
                change({ ...music, ducking: { ...music.ducking, enabled: !music.ducking.enabled } })
              }
            />
            {t('scenario.editor.tourMusicDucking')}
          </label>
          {music.ducking.enabled && (
            <TourInspectorNumericRow
              label={t('scenario.editor.tourMusicLevel')}
              value={music.ducking.level * 100}
              min={0}
              max={100}
              unit="%"
              disabled={disabled}
              onChange={(value) =>
                change({ ...music, ducking: { ...music.ducking, level: value / 100 } })
              }
            />
          )}
        </>
      )}
    </GuideInspectorGroup>
  );
}
