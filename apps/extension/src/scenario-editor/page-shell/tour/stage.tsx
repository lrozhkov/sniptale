import { prepareTourWindowHeaders } from '../../../features/scenario/tour-player/document';
import type { TourPlayerLabels } from '../../../features/scenario/tour-player/public';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { TourDocument, TourRect } from '@sniptale/runtime-contracts/scenario/types/tour';
import { createTourPlayer } from '../../../features/scenario/tour-player/controller';
import styles from '../../../features/scenario/tour-player/player.css?raw';
import stageStyles from './stage-shadow.css?raw';
import { tourPlayerLabels } from './labels';
import type { Translate } from '../../../platform/i18n';
import type { TourSelection } from './selection';
import { tourActionTarget } from './action-navigation';

/** The editor mounts the real scene renderer; the shadow root contains its stylesheet. */
export function TourStage({
  tour,
  images,
  selection,
  disabled = false,
  onSelectObject,
  onNavigateSelection,
  onMoveObject,
  onResizeObject,
  onFrameCamera,
  onFrameImage,
  view = 'edit',
  previewKey = 0,
  previewOrigin = 'selection',
  t,
}: {
  view?: 'edit' | 'frame' | 'preview' | 'image';
  onFrameImage?: (placement: { center: { x: number; y: number }; zoom: number }) => void;
  previewKey?: number;
  previewOrigin?: 'selection' | 'beginning';
  onFrameCamera?: (camera: { center: { x: number; y: number }; zoom: number }) => void;
  tour: TourDocument;
  images: Record<string, string | null>;
  selection: TourSelection | null;
  disabled?: boolean;
  onSelectObject: (id: string | null) => void;
  onNavigateSelection?: (selection: Extract<TourSelection, { kind: 'slide' }>) => void;
  onResizeObject?: (id: string, rect: TourRect) => void;
  onMoveObject: (id: string, point: { x: number; y: number }) => void;
  t: Translate;
}) {
  const [shadow, setShadow] = useState<ShadowRoot | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const controller = useRef<ReturnType<typeof createTourPlayer> | null>(null);
  const callbacks = useRef({
    onSelectObject,
    onMoveObject,
    onResizeObject,
    onFrameCamera,
    onFrameImage,
    disabled,
    onNavigateSelection,
  });
  callbacks.current = {
    onSelectObject,
    onMoveObject,
    onResizeObject,
    onFrameCamera,
    onFrameImage,
    disabled,
    onNavigateSelection,
  };
  const labels = useRef(tourPlayerLabels(t)).current;
  const selectionKind = selection?.kind;
  const selectedSlide = selection?.kind === 'slide' ? selection.slideId : null;
  const selectedObject = selection?.kind === 'slide' ? selection.objectId : null;
  const framedTour = useMemo(() => {
    if (view === 'image')
      return {
        ...tour,
        slides: tour.slides.map((slide) =>
          slide.kind === 'image'
            ? { ...slide, camera: { ...slide.camera, mode: 'off' as const } }
            : slide
        ),
      };
    if (view !== 'frame' || !selectedSlide || !selectedObject) return tour;
    return {
      ...tour,
      slides: tour.slides.map((slide) => {
        if (slide.id !== selectedSlide || slide.kind !== 'image') return slide;
        const camera = slide.actions.find((entry) => entry.object.id === selectedObject)?.object
          .camera;
        return camera ? { ...slide, camera } : slide;
      }),
    };
  }, [tour, view, selectedSlide, selectedObject]);
  const input = {
    tour:
      view === 'preview'
        ? { ...tour, playback: { ...tour.playback, autoplay: true, loop: false } }
        : framedTour,
    labels,
    headers: prepareTourWindowHeaders(framedTour),
    assets: Object.entries(images).flatMap(([id, src]) => (src ? [{ id, src }] : [])),
  };
  const latest = useRef({ input, selection, tour, images });
  latest.current = { input, selection, tour: framedTour, images };
  const admitted = useRef<{ tour: TourDocument; images: Record<string, string | null> } | null>(
    null
  );
  const authoringScroll = useRef(0);
  const lastSelection = useRef<TourSelection | null>(null);
  const hasAuthoringNavigation = Boolean(onNavigateSelection);
  useLayoutEffect(() => {
    const stageRoot = root.current;
    if (!stageRoot) return;
    const player = createTourPlayer(stageRoot, latest.current.input, {
      preview: view === 'preview',
      ...(view === 'preview' &&
      previewOrigin === 'selection' &&
      latest.current.selection?.kind === 'slide'
        ? {
            initialSlideId: latest.current.selection.slideId,
            ...(latest.current.selection.objectId
              ? { initialActionId: latest.current.selection.objectId }
              : {}),
          }
        : {}),
      authoring:
        view === 'preview'
          ? undefined
          : {
              cameraFrame: view === 'frame',
              imageFrame: view === 'image',
              onFrameImage: (placement) => callbacks.current.onFrameImage?.(placement),
              onFrameCamera: (camera) => callbacks.current.onFrameCamera?.(camera),
              canEdit: () => !callbacks.current.disabled,
              onSelectObject: (id) => callbacks.current.onSelectObject(id),
              onResizeObject: (id, rect) => callbacks.current.onResizeObject?.(id, rect),
              onMoveObject: (id, point) => callbacks.current.onMoveObject(id, point),
              ...(hasAuthoringNavigation
                ? {
                    navigation: {
                      canMove: (direction: -1 | 1) =>
                        Boolean(
                          tourActionTarget(
                            latest.current.input.tour,
                            latest.current.selection,
                            direction
                          )
                        ),
                      move: (direction: -1 | 1) => {
                        const target = tourActionTarget(
                          latest.current.input.tour,
                          latest.current.selection,
                          direction
                        );
                        if (target) callbacks.current.onNavigateSelection?.(target);
                      },
                      selectSlide: (slideId: string) =>
                        callbacks.current.onNavigateSelection?.({
                          kind: 'slide',
                          slideId,
                          objectId: null,
                        }),
                    },
                  }
                : {}),
            },
    });
    controller.current = player;
    admitted.current = { tour: latest.current.tour, images: latest.current.images };
    lastSelection.current = latest.current.selection;
    if (
      view !== 'preview' ||
      (previewOrigin === 'selection' && latest.current.selection?.kind === 'end')
    )
      restoreSelection(player, latest.current.selection);
    if (view !== 'preview') {
      const body = stageRoot.querySelector<HTMLElement>('[data-tour-hint-text]');
      if (body) body.scrollTop = authoringScroll.current;
    }
    return () => {
      if (view !== 'preview')
        authoringScroll.current =
          stageRoot.querySelector<HTMLElement>('[data-tour-hint-text]')?.scrollTop ?? 0;
      player.dispose();
      controller.current = null;
    };
  }, [shadow, view, previewKey, previewOrigin, hasAuthoringNavigation]);
  useLayoutEffect(() => {
    if (!controller.current) return;
    if (admitted.current?.tour === framedTour && admitted.current.images === images) return;
    admitted.current = { tour: framedTour, images };
    controller.current.update(latest.current.input);
    if (view !== 'preview') restoreSelection(controller.current, latest.current.selection);
  }, [tour, framedTour, images, view]);
  useLayoutEffect(() => {
    const previous = lastSelection.current;
    const current = latest.current.selection;
    const same =
      previous?.kind === current?.kind &&
      (current?.kind !== 'slide' ||
        (previous?.kind === 'slide' &&
          previous.slideId === current.slideId &&
          previous.objectId === current.objectId));
    lastSelection.current = current;
    if (controller.current && (view !== 'preview' || !same))
      restoreSelection(controller.current, current);
  }, [selectionKind, selectedSlide, selectedObject, view]);
  return (
    <div
      className="tour-stage-host"
      data-view={view}
      data-authoring-navigation={Boolean(onNavigateSelection)}
      onDragStart={(event) => event.preventDefault()}
      ref={(node) => {
        if (node && !node.shadowRoot) setShadow(node.attachShadow({ mode: 'open' }));
      }}
    >
      {shadow &&
        createPortal(
          <>
            <style>{styles}</style>
            <style>{stageStyles}</style>
            <TourStageScaffold root={root} labels={labels} />
          </>,
          shadow
        )}
    </div>
  );
}

function restoreSelection(
  player: ReturnType<typeof createTourPlayer>,
  selection: TourSelection | null
) {
  if (selection?.kind === 'end') player.selectEnd();
  else if (selection) player.select(selection.slideId);
  player.selectObject(selection?.kind === 'slide' ? selection.objectId : null);
}

/** React owns scaffold controls; the common player exclusively owns generated scene content. */
function TourStageScaffold({
  root,
  labels,
}: {
  root: React.RefObject<HTMLDivElement | null>;
  labels: TourPlayerLabels;
}) {
  return (
    <div id="tour-player" ref={root}>
      <div className="tour-viewport" data-tour-viewport>
        <section className="tour-stage" data-tour-stage>
          <div className="tour-scene" data-tour-scene />
        </section>
        <aside className="tour-hint" data-tour-hint hidden>
          <div className="tour-hint-header">
            <strong className="tour-hint-action-title" data-tour-hint-action-title hidden />
            <button
              className="tour-button tour-caption-title"
              data-tour-hint-toggle
              hidden
              aria-expanded="true"
            >
              <span data-tour-hint-title />
            </button>
            <button className="tour-button" data-tour-hint-close aria-label={labels.close}>
              ×
            </button>
          </div>
          <div className="tour-hint-text" data-tour-hint-text />
          <div className="tour-hint-controls">
            <button className="tour-button" data-tour-hint-previous aria-label={labels.previous}>
              {labels.previous}
            </button>
            <span data-tour-hint-point-count hidden />
            <span data-tour-hint-count hidden />
            <button className="tour-button" data-tour-hint-next aria-label={labels.next}>
              {labels.next}
            </button>
          </div>
        </aside>
        <dialog className="tour-navigation" data-tour-navigation aria-label={labels.contents} />
      </div>
      <footer className="tour-toolbar">
        <div className="tour-feedback">
          <span className="tour-title" data-tour-title aria-live="polite" />
          <span className="tour-playback-status" data-tour-status role="status" hidden />
        </div>
        <div className="tour-controls">
          <div className="tour-playback" data-tour-playback />
          <div className="tour-nav">
            <button className="tour-button" data-tour-previous>
              {labels.previous}
            </button>
            <span data-tour-counter />
            <button className="tour-button" data-tour-next>
              {labels.next}
            </button>
          </div>
          <button
            className="tour-button"
            data-tour-contents
            aria-haspopup="dialog"
            aria-expanded="false"
          >
            {labels.contents}
          </button>
        </div>
      </footer>
    </div>
  );
}
