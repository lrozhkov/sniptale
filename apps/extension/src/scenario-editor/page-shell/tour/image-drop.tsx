import { useEffect, useRef, useState, type ReactNode } from 'react';
import { z } from 'zod';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import type {
  GuideImageImportSource,
  TourImageImportPlacement,
} from '../../../composition/persistence/scenario/store/public';
import {
  applyTourCommands,
  generateTourFromMaterials,
  getTourImages,
  getTourAudioResources,
  remapTourImageGeometry,
  type TourCommand,
} from '../../../features/scenario/project/public';
import { GUIDE_LIBRARY_IMAGE_DRAG_TYPE, readGuideLibraryImageDrag } from '../image-drop';
import type { Translate } from '../../../platform/i18n';

export const TOUR_RESOURCE_DRAG_TYPE = 'application/x-sniptale-tour-resource';
const resource = z
  .object({ projectId: z.string().min(1).max(160), slideId: z.string().min(1).max(160) })
  .strict();

/** Tour drops share the existing import transaction; local resources keep their immutable identity. */
export function TourImageDropZone({
  project,
  disabled,
  onImport,
  onChange,
  children,
  t,
}: {
  project: GuideProject;
  disabled: boolean;
  children: ReactNode;
  t: Translate;
  onChange: (project: GuideProject) => void;
  onImport: (
    sources: GuideImageImportSource[],
    placement: TourImageImportPlacement,
    signal: AbortSignal
  ) => Promise<boolean>;
}) {
  const pending = useRef<AbortController | null>(null);
  const [hovered, setHovered] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => () => pending.current?.abort(), []);
  const importImages = async (
    sources: GuideImageImportSource[],
    placement: TourImageImportPlacement
  ) => {
    if (!sources.length || disabled || pending.current) return;
    const operation = new AbortController();
    pending.current = operation;
    setFailed(false);
    try {
      const accepted = await onImport(sources, placement, operation.signal);
      if (!operation.signal.aborted) setFailed(!accepted);
    } catch {
      if (!operation.signal.aborted) setFailed(true);
    } finally {
      if (pending.current === operation) pending.current = null;
    }
  };
  const supported = (transfer: DataTransfer) =>
    transfer.types.includes('Files') ||
    transfer.types.includes(GUIDE_LIBRARY_IMAGE_DRAG_TYPE) ||
    transfer.types.includes(TOUR_RESOURCE_DRAG_TYPE);
  return (
    <div
      className="tour-drop-zone"
      data-drag-over={hovered}
      onDragOver={(event) => {
        if (disabled || !supported(event.dataTransfer)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        setHovered(true);
      }}
      onDragLeave={(event) => {
        if (
          !(event.relatedTarget instanceof Node) ||
          !event.currentTarget.contains(event.relatedTarget)
        )
          setHovered(false);
      }}
      onDrop={(event) => {
        setHovered(false);
        if (disabled || !supported(event.dataTransfer)) return;
        event.preventDefault();
        event.stopPropagation();
        const placement = dropPlacement(event.target, project);
        if (event.dataTransfer.types.includes(TOUR_RESOURCE_DRAG_TYPE)) {
          try {
            onChange(
              placeLocalResource(
                project,
                event.dataTransfer.getData(TOUR_RESOURCE_DRAG_TYPE),
                placement
              )
            );
            setFailed(false);
          } catch {
            setFailed(true);
          }
        } else {
          const sources = event.dataTransfer.types.includes(GUIDE_LIBRARY_IMAGE_DRAG_TYPE)
            ? readGuideLibraryImageDrag(event.dataTransfer)
            : [...event.dataTransfer.files].map((file) => ({ kind: 'file' as const, file }));
          if (sources) void importImages(sources, placement);
          else setFailed(true);
        }
      }}
      onPaste={(event) => {
        if (
          disabled ||
          event.nativeEvent
            .composedPath()
            .some(
              (node) => node instanceof Element && node.matches('input,textarea,[contenteditable]')
            )
        )
          return;
        const files = [...event.clipboardData.files].filter((file) =>
          file.type.startsWith('image/')
        );
        if (!files.length) return;
        event.preventDefault();
        void importImages(
          files.map((file) => ({ kind: 'file', file })),
          dropPlacement(event.target, project)
        );
      }}
    >
      {children}
      {hovered && (
        <div className="tour-drop-feedback" role="status">
          {t('scenario.editor.tourImageDrop')}
        </div>
      )}
      {failed && (
        <p className="tour-drop-error" role="alert">
          {t('scenario.editor.guideImportFailed')}
        </p>
      )}
    </div>
  );
}

function dropPlacement(
  target: EventTarget | null,
  project: GuideProject
): TourImageImportPlacement {
  if (!(target instanceof Element)) return { kind: 'tour-slides' };
  const before = target.closest<HTMLElement>('[data-tour-before]')?.dataset['tourBefore'];
  if (before && project.tour?.slides.some((slide) => slide.id === before))
    return { kind: 'tour-slides', beforeSlideId: before };
  const id = target.closest<HTMLElement>('[data-tour-drop-slide]')?.dataset['tourDropSlide'];
  const slide = project.tour?.slides.find((entry) => entry.id === id);
  return slide
    ? { kind: slide.kind === 'image' ? 'tour-image' : 'tour-background', slideId: slide.id }
    : { kind: 'tour-slides' };
}

function placeLocalResource(
  project: GuideProject,
  text: string,
  placement: TourImageImportPlacement
): GuideProject {
  if (text.length > 1024 || !project.tour) throw new Error('Invalid tour resource');
  const value: unknown = JSON.parse(text);
  const parsed = resource.parse(value);
  if (parsed.projectId !== project.id) throw new Error('Foreign tour resource');
  const source = project.tour.slides.find((slide) => slide.id === parsed.slideId);
  const image = source?.kind === 'image' ? source.image : source?.background.image;
  if (!image || !source) throw new Error('Missing tour resource');
  let command: TourCommand;
  if (placement.kind === 'tour-slides') {
    const generated = generateTourFromMaterials([{ image, title: source.title, description: '' }]);
    const slide = generated.tour.slides[0];
    if (!slide) throw new Error('Missing generated slide');
    command = {
      kind: 'insert-slide',
      slide,
      ...(placement.beforeSlideId ? { beforeId: placement.beforeSlideId } : {}),
    };
  } else {
    const target = project.tour.slides.find((slide) => slide.id === placement.slideId);
    if (!target) throw new Error('Missing destination');
    const slide =
      target.kind === 'image'
        ? { ...remapTourImageGeometry(target, null).slide, image }
        : { ...target, background: { ...target.background, image } };
    command = { kind: 'replace-slide', slideId: target.id, slide };
  }
  return applyTourCommands(project, [command], {
    images: getTourImages(project.tour),
    audio: getTourAudioResources(project.tour),
  });
}
