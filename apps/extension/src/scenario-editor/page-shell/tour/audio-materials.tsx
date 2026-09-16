import { useState } from 'react';
import { Music2, Plus, ArrowRight, Trash2, Headphones } from 'lucide-react';
import type {
  TourAudioResource,
  TourDocument,
  TourNarration,
} from '@sniptale/runtime-contracts/scenario/types/tour';
import {
  getTourAudioResources,
  getTourNarrationTarget,
  getTourNarrationTargets,
  type TourCommand,
} from '../../../features/scenario/project/public';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { formatDurationLabel } from '../../../composition/audio-recording/format';
import type { Translate } from '../../../platform/i18n';
import type { TourSelection } from './selection';
import { TourNarrationPreview } from './narration-preview';

/** A new attachment starts with the complete material; existing attachments retain their own trim. */
export function materialNarration(resource: TourAudioResource): TourNarration {
  return {
    assetId: resource.assetId,
    duration: resource.duration,
    trimStart: 0,
    trimEnd: resource.duration,
    gain: 1,
    transcript: '',
  };
}

/** Choosing and previewing are separate actions; preview never assigns a material. */
export function TourAudioPicker({
  resources,
  disabled,
  onChoose,
  t,
}: {
  resources: TourAudioResource[];
  disabled: boolean;
  onChoose: (resource: TourAudioResource) => void;
  t: Translate;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  return (
    <div
      className="tour-audio-picker"
      role="group"
      aria-label={t('scenario.editor.tourAudioChoose')}
    >
      {resources.map((resource) => (
        <div key={resource.assetId}>
          <div className="tour-audio-choice">
            <button
              disabled={disabled}
              className="tour-audio-name"
              onClick={() => onChoose(resource)}
            >
              <Music2 size={15} />
              <span>{resource.name || t('scenario.editor.tourNarration')}</span>
              <small>{formatDurationLabel(resource.duration)}</small>
            </button>
            <ContentToolbarButton
              title={t('scenario.editor.tourAudioPreview')}
              aria-expanded={preview === resource.assetId}
              onClick={() => setPreview(preview === resource.assetId ? null : resource.assetId)}
            >
              <Headphones size={15} />
            </ContentToolbarButton>
          </div>
          {preview === resource.assetId && (
            <TourNarrationPreview
              key={resource.assetId}
              narration={materialNarration(resource)}
              t={t}
            />
          )}
        </div>
      ))}
    </div>
  );
}

/** Audio resources outlive attachments; usage navigation resolves the exact object, not just its slide. */
export function TourAudioResources({
  tour,
  selection,
  disabled,
  onSelect,
  command,
  t,
}: {
  tour: TourDocument;
  selection: TourSelection | null;
  disabled: boolean;
  onSelect: (selection: Extract<TourSelection, { kind: 'slide' }>) => void;
  command: (command: TourCommand) => boolean;
  t: Translate;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const resources = getTourAudioResources(tour);
  const selected = selection?.kind === 'slide' ? selection : null;
  const selectedSlide = tour.slides.find((slide) => slide.id === selected?.slideId);
  const currentNarration =
    selectedSlide && selected
      ? getTourNarrationTarget(selectedSlide, selected.objectId)?.narration
      : null;
  return (
    <section className="tour-audio-resources" aria-label={t('scenario.editor.tourAudioResources')}>
      <h3>
        <Music2 size={15} />
        {t('scenario.editor.tourAudioResources')}
      </h3>
      {!resources.length && (
        <p className="guide-inspector-hint">{t('scenario.editor.tourAudioEmpty')}</p>
      )}
      {resources.map((resource) => {
        const usages = tour.slides.flatMap((slide) =>
          getTourNarrationTargets(slide)
            .filter((target) => target.narration?.assetId === resource.assetId)
            .map((target) => ({
              kind: 'slide' as const,
              slideId: slide.id,
              objectId: target === slide ? null : target.id,
            }))
        );
        return (
          <div
            key={resource.assetId}
            className="tour-audio-resource"
            data-tour-audio-resource={resource.assetId}
          >
            <button
              className="tour-audio-name"
              title={resource.name}
              aria-expanded={preview === resource.assetId}
              onClick={() => setPreview(preview === resource.assetId ? null : resource.assetId)}
            >
              <Music2 size={15} />
              <span>{resource.name || t('scenario.editor.tourNarration')}</span>
              <small>{formatDurationLabel(resource.duration)}</small>
            </button>
            <div className="tour-audio-resource-actions">
              <ContentToolbarButton
                title={t('scenario.editor.tourAudioPreview')}
                aria-expanded={preview === resource.assetId}
                onClick={() => setPreview(preview === resource.assetId ? null : resource.assetId)}
              >
                <Headphones size={15} />
              </ContentToolbarButton>
              <ContentToolbarButton
                title={`${t('scenario.editor.tourAudioUsed')}: ${usages.length}`}
                disabled={!usages.length}
                onClick={() => {
                  const index = usages.findIndex(
                    (usage) =>
                      selected?.slideId === usage.slideId && selected.objectId === usage.objectId
                  );
                  const next = usages[(index + 1) % usages.length];
                  if (next) onSelect(next);
                }}
              >
                <ArrowRight size={14} />
                <span>{usages.length}</span>
              </ContentToolbarButton>
              <ContentToolbarButton
                title={t('scenario.editor.tourAudioAttach')}
                disabled={disabled || !selected}
                onClick={() => {
                  if (!selected) return;
                  const voice = materialNarration(resource);
                  command({
                    kind: 'set-narration',
                    slideId: selected.slideId,
                    objectId: selected.objectId,
                    narration: selected.objectId
                      ? {
                          ...voice,
                          trigger:
                            currentNarration &&
                            'trigger' in currentNarration &&
                            currentNarration.trigger === 'enter'
                              ? 'enter'
                              : 'activation',
                        }
                      : voice,
                  });
                }}
              >
                <Plus size={15} />
              </ContentToolbarButton>
              <ContentToolbarButton
                title={t('scenario.editor.tourAudioDelete')}
                disabled={disabled}
                onClick={() =>
                  command({ kind: 'remove-audio-resource', assetId: resource.assetId })
                }
              >
                <Trash2 size={15} />
              </ContentToolbarButton>
            </div>
            {preview === resource.assetId && (
              <TourNarrationPreview
                key={resource.assetId}
                narration={materialNarration(resource)}
                t={t}
              />
            )}
          </div>
        );
      })}
      {!selected && resources.length > 0 && (
        <p className="guide-inspector-hint">{t('scenario.editor.tourAudioSelectHint')}</p>
      )}
    </section>
  );
}
