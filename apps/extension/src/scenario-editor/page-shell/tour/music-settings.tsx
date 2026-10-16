import { ToggleField } from '../../../ui/compact-inspector-controls/controls';
import { Music2, Unlink } from 'lucide-react';
import {
  createTourBackgroundMusic,
  type TourDocument,
} from '@sniptale/runtime-contracts/scenario/types/tour';
import { getTourAudioResources } from '../../../features/scenario/project/public';
import type { importScenarioNarration } from '../../../composition/persistence/scenario/store/public';
import type { Translate } from '../../../platform/i18n';
import { GuideInspectorGroup } from '../inspector';
import { ScenarioInspectorActionButton } from '../inspector-actions';
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
        catalog={{
          resources,
          disabled,
          onChoose: (entry) => {
            const identity = { assetId: entry.assetId, duration: entry.duration };
            return change(music ? { ...music, ...identity } : createTourBackgroundMusic(identity));
          },
        }}
      />
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
          <ToggleField
            disabled={disabled}
            value={music.loop}
            label={t('scenario.editor.tourMusicLoop')}
            onChange={() => change({ ...music, loop: !music.loop })}
          />
          <ToggleField
            disabled={disabled}
            value={music.ducking.enabled}
            label={t('scenario.editor.tourMusicDucking')}
            onChange={() =>
              change({ ...music, ducking: { ...music.ducking, enabled: !music.ducking.enabled } })
            }
          />
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
