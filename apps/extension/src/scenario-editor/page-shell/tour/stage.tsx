import type { TourPlayerLabels } from '../../../features/scenario/tour-player/public';
import { useLayoutEffect, useRef, useState } from 'react';
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
  view = 'edit',
  previewKey = 0,
  t,
}: {
  view?: 'edit' | 'frame' | 'preview';
  previewKey?: number;
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
    disabled,
    onNavigateSelection,
  });
  callbacks.current = {
    onSelectObject,
    onMoveObject,
    onResizeObject,
    onFrameCamera,
    disabled,
    onNavigateSelection,
  };
  const labels = useRef(tourPlayerLabels(t)).current;
  const input = {
    tour:
      view === 'preview'
        ? { ...tour, playback: { ...tour.playback, autoplay: true, loop: false } }
        : tour,
    labels,
    assets: Object.entries(images).flatMap(([id, src]) => (src ? [{ id, src }] : [])),
  };
  const latest = useRef({ input, selection });
  latest.current = { input, selection };
  const hasAuthoringNavigation = Boolean(onNavigateSelection);
  useLayoutEffect(() => {
    if (!root.current) return;
    const player = createTourPlayer(root.current, latest.current.input, {
      preview: view === 'preview',
      ...(view === 'preview' && latest.current.selection?.kind === 'slide'
        ? { initialSlideId: latest.current.selection.slideId }
        : {}),
      authoring:
        view === 'preview'
          ? undefined
          : {
              cameraFrame: view === 'frame',
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
    restoreSelection(player, latest.current.selection);
    return () => {
      player.dispose();
      controller.current = null;
    };
  }, [shadow, view, previewKey, hasAuthoringNavigation]);
  useLayoutEffect(() => {
    if (!controller.current) return;
    controller.current.update(latest.current.input);
    restoreSelection(controller.current, latest.current.selection);
  }, [tour, images]);
  const selectionKind = selection?.kind;
  const selectedSlide = selection?.kind === 'slide' ? selection.slideId : null;
  const selectedObject = selection?.kind === 'slide' ? selection.objectId : null;
  useLayoutEffect(() => {
    if (controller.current) restoreSelection(controller.current, latest.current.selection);
  }, [selectionKind, selectedSlide, selectedObject]);
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
