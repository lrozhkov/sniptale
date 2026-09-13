import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { TourDocument } from '@sniptale/runtime-contracts/scenario/types/tour';
import { createTourPlayer } from '../../../features/scenario/tour-player/controller';
import styles from '../../../features/scenario/tour-player/player.css?raw';
import type { TourPlayerLabels } from '../../../features/scenario/tour-player/public';
import type { Translate } from '../../../platform/i18n';
import type { TourSelection } from './selection';

/** The editor mounts the real scene renderer; the shadow root contains its stylesheet. */
export function TourStage({
  tour,
  images,
  selection,
  disabled = false,
  onSelectObject,
  onMoveObject,
  t,
}: {
  tour: TourDocument;
  images: Record<string, string | null>;
  selection: TourSelection | null;
  disabled?: boolean;
  onSelectObject: (id: string | null) => void;
  onMoveObject: (id: string, point: { x: number; y: number }) => void;
  t: Translate;
}) {
  const [shadow, setShadow] = useState<ShadowRoot | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const controller = useRef<ReturnType<typeof createTourPlayer> | null>(null);
  const callbacks = useRef({ onSelectObject, onMoveObject, disabled });
  callbacks.current = { onSelectObject, onMoveObject, disabled };
  const labels = useRef<TourPlayerLabels>({
    expand: t('scenario.editor.tourExpandCaption'),
    collapse: t('scenario.editor.tourCollapseCaption'),
    previous: t('scenario.editor.tourHintPrevious'),
    next: t('scenario.editor.tourHintNext'),
    contents: t('scenario.editor.tourSlides'),
    close: t('scenario.editor.close'),
    restart: t('scenario.editor.tourRestart'),
    finished: t('scenario.editor.tourEnd'),
    empty: t('scenario.editor.tourImageEmpty'),
    point: t('scenario.editor.tourHotspot'),
    details: t('scenario.editor.tourAnnotation'),
    play: t('scenario.editor.tourPlay'),
    pause: t('scenario.editor.tourPause'),
    seek: t('scenario.editor.tourSeek'),
    retry: t('scenario.editor.tourRetry'),
    loading: t('scenario.editor.tourLoading'),
    mediaError: t('scenario.editor.tourMediaError'),
    choose: t('scenario.editor.tourChooseDestination'),
  }).current;
  const input = {
    tour,
    labels,
    assets: Object.entries(images).flatMap(([id, src]) => (src ? [{ id, src }] : [])),
  };
  const latest = useRef({ input, selection });
  latest.current = { input, selection };
  useLayoutEffect(() => {
    if (!root.current) return;
    const player = createTourPlayer(root.current, latest.current.input, {
      authoring: {
        canEdit: () => !callbacks.current.disabled,
        onSelectObject: (id) => callbacks.current.onSelectObject(id),
        onMoveObject: (id, point) => callbacks.current.onMoveObject(id, point),
      },
    });
    controller.current = player;
    restoreSelection(player, latest.current.selection);
    return () => {
      player.dispose();
      controller.current = null;
    };
  }, [shadow]);
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
      ref={(node) => {
        if (node && !node.shadowRoot) setShadow(node.attachShadow({ mode: 'open' }));
      }}
    >
      {shadow &&
        createPortal(
          <>
            <style>{styles}</style>
            <style>{`
              :host { display: block; height: 100%; min-height: 0; font: 14px system-ui, sans-serif; }
              #tour-player { height: 100%; background: transparent; }
              .tour-toolbar, .tour-transport { display: none; }
              .tour-scene[data-dragging=true], .tour-scene[data-dragging=true] * { cursor: grabbing !important; }
              .tour-mask { border: 0; padding: 0; }
              .tour-mask[data-selected=true] { outline: 2px solid var(--tour-accent); outline-offset: 2px; }
              .tour-hotspot[data-selected=true], .tour-button[data-selected=true] {
                z-index: 3; outline: 2px solid var(--tour-accent); outline-offset: 4px;
              }
            `}</style>
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
      <header className="tour-toolbar">
        <button data-tour-contents>{labels.contents}</button>
        <span data-tour-title />
      </header>
      <div className="tour-viewport" data-tour-viewport>
        <section className="tour-stage" data-tour-stage>
          <div className="tour-scene" data-tour-scene />
        </section>
        <aside className="tour-hint" data-tour-hint hidden>
          <div className="tour-hint-header">
            <span data-tour-hint-point-count hidden />
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
            <span data-tour-hint-count hidden />
            <button className="tour-button" data-tour-hint-next aria-label={labels.next}>
              {labels.next}
            </button>
          </div>
        </aside>
      </div>
      <footer className="tour-transport">
        <button data-tour-previous>{labels.previous}</button>
        <span data-tour-counter />
        <button data-tour-next>{labels.next}</button>
      </footer>
      <dialog className="tour-navigation" data-tour-navigation aria-label={labels.contents} />
    </div>
  );
}
