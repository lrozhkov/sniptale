import { useState } from 'react';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { TourDocument, TourSlide } from '@sniptale/runtime-contracts/scenario/types/tour';
import {
  applyTourCommands,
  createTourDocument,
  createTourImageSlide,
  getTourImages,
  getTourAudioResources,
  type TourCommand,
} from '../../../features/scenario/project/public';

export type TourSelection =
  | { kind: 'slide'; slideId: string; objectId: string | null }
  | { kind: 'end' };

/** Only selection is local; every authored change returns through canonical project history. */
export function useTourSelection(
  project: GuideProject,
  disabled: boolean,
  onChange: (project: GuideProject, group?: string | null) => void,
  initialSlideId?: string | null
) {
  const [requested, setRequested] = useState<{
    projectId: string;
    selection: TourSelection;
  } | null>(() =>
    initialSlideId
      ? {
          projectId: project.id,
          selection: { kind: 'slide', slideId: initialSlideId, objectId: null },
        }
      : null
  );
  const [failed, setFailed] = useState(false);
  const tour = project.tour;
  const remembered = requested?.projectId === project.id ? requested.selection : null;
  const rememberedSlide = remembered?.kind === 'slide' ? remembered : null;
  const slide =
    tour?.slides.find((entry) => entry.id === rememberedSlide?.slideId) ?? tour?.slides[0] ?? null;
  const objects =
    slide?.kind === 'image'
      ? [...slide.hotspots, ...slide.annotations, ...slide.masks]
      : (slide?.buttons ?? []);
  const selection: TourSelection | null =
    remembered?.kind === 'end'
      ? remembered
      : slide
        ? {
            kind: 'slide',
            slideId: slide.id,
            objectId:
              rememberedSlide?.slideId === slide.id &&
              objects.some((object) => object.id === rememberedSlide.objectId)
                ? rememberedSlide.objectId
                : null,
          }
        : null;
  const select = (value: TourSelection) =>
    setRequested({ projectId: project.id, selection: value });
  const command = (operation: TourCommand, group?: string | null) => {
    if (disabled) return false;
    const base = tour ? project : { ...project, tour: createTourDocument() };
    try {
      const next = applyTourCommands(base, [operation], {
        images: tour ? getTourImages(tour) : [],
        audio: tour ? getTourAudioResources(tour) : [],
      });
      onChange(next, group);
      setFailed(false);
      return true;
    } catch {
      setFailed(true);
      return false;
    }
  };
  const changeSlide = (next: TourSlide, group?: string | null) =>
    command({ kind: 'replace-slide', slideId: next.id, slide: next }, group);
  return {
    selection,
    slide: selection?.kind === 'end' ? null : slide,
    failed,
    select,
    command,
    changeSlide,
    changeTour: (next: TourDocument, group?: string | null) =>
      command({ kind: 'replace-tour', tour: next }, group),
    add: (kind: 'image' | 'navigation') => {
      const image = createTourImageSlide();
      const added: TourSlide =
        kind === 'image'
          ? image
          : {
              kind: 'navigation',
              id: image.id,
              title: '',
              description: '',
              background: { color: tour?.stage.background ?? '#111827', image: null },
              buttons: [],
              narration: null,
              timing: image.timing,
            };
      if (command({ kind: 'insert-slide', slide: added }))
        select({ kind: 'slide', slideId: added.id, objectId: null });
    },
  };
}
