import { useState } from 'react';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { TourSlide } from '@sniptale/runtime-contracts/scenario/types/tour';
import type { Translate } from '../../../platform/i18n';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { Expand, ArrowRight, Image } from 'lucide-react';
import { GuideResourceDialog } from '../resource-drawer';
import { TOUR_RESOURCE_DRAG_TYPE } from './image-drop';
import type { useTourSelection } from './selection';

export function TourResources({
  project,
  images,
  onSelect,
  t,
  state,
}: {
  project: GuideProject;
  images: Record<string, string | null>;
  t: Translate;
  onSelect: (id: string) => void;
  state: ReturnType<typeof useTourSelection>;
}) {
  const [preview, setPreview] = useState<{ src: string; title: string } | null>(null);
  const resources = new Map<string, { slide: TourSlide; ids: string[] }>();
  for (const slide of project.tour?.slides ?? []) {
    const image = slide.kind === 'image' ? slide.image : slide.background.image;
    if (!image) continue;
    const entry = resources.get(image.assetId);
    if (entry) entry.ids.push(slide.id);
    else resources.set(image.assetId, { slide, ids: [slide.id] });
  }
  return (
    <>
      <div className="tour-resource-list">
        {[...resources].map(([id, { slide, ids }]) => (
          <div
            key={id}
            className="tour-resource-row"
            draggable
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'copy';
              event.dataTransfer.setData(
                TOUR_RESOURCE_DRAG_TYPE,
                JSON.stringify({ projectId: project.id, slideId: slide.id })
              );
            }}
          >
            <button
              className="tour-resource-thumbnail"
              onClick={() => onSelect(slide.id)}
              title={slide.title || t('scenario.editor.tourUntitled')}
            >
              {images[id] ? <img src={images[id]!} alt="" /> : <Image size={20} />}
            </button>
            <span>{slide.title || t('scenario.editor.tourUntitled')}</span>
            <ContentToolbarButton
              disabled={!images[id]}
              title={t('scenario.editor.tourPreviewImage')}
              onClick={() => {
                const src = images[id];
                if (src) setPreview({ src, title: slide.title });
              }}
            >
              <Expand size={15} />
            </ContentToolbarButton>
            <ContentToolbarButton
              title={`${t('scenario.editor.tourUsed')}: ${ids.length}`}
              onClick={() => {
                const current =
                  state.selection?.kind === 'slide' ? ids.indexOf(state.selection.slideId) : -1;
                const next = ids[(current + 1) % ids.length];
                if (next) onSelect(next);
              }}
            >
              <ArrowRight size={12} />
              <span>{ids.length}</span>
            </ContentToolbarButton>
          </div>
        ))}
      </div>
      {preview && (
        <GuideResourceDialog
          title={preview.title || t('scenario.editor.tourPreviewImage')}
          id="tour-resource-preview"
          onClose={() => setPreview(null)}
          t={t}
        >
          <img className="tour-resource-preview" src={preview.src} alt={preview.title} />
        </GuideResourceDialog>
      )}
    </>
  );
}
