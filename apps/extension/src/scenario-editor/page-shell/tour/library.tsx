import { TourResources } from './materials';
import { useState } from 'react';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { TourDocument, TourSlide } from '@sniptale/runtime-contracts/scenario/types/tour';
import { getTourIncomingReferences } from '../../../features/scenario/project/public';
import { FloatingChromePanel } from '@sniptale/ui/floating-chrome';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { Image, List, X, Plus, ListPlus, Copy, Trash2, GripVertical, Flag } from 'lucide-react';
import type { useGuidePanels } from '../panel-layout';
import { GuideImageUpload } from '../image-upload';
import type { useTourSelection } from './selection';
import type { Translate } from '../../../platform/i18n';

type LibraryProps = {
  project: GuideProject;
  images: Record<string, string | null>;
  panels: ReturnType<typeof useGuidePanels>;
  disabled: boolean;
  importDisabled?: boolean;
  t: Translate;
};

export function TourLibraryPanel(
  props: LibraryProps & {
    state: ReturnType<typeof useTourSelection>;
    onSelect: (id: string) => void;
    onGenerate: () => void;
    onUpload: (file: File, signal: AbortSignal) => Promise<boolean>;
  }
) {
  const { panels, project, disabled, importDisabled = disabled, t, state } = props;
  return (
    <FloatingChromePanel
      role="complementary"
      id="guide-library-panel"
      className="guide-library-panel"
      hidden={!panels.leftOpen}
      aria-label={t('scenario.editor.tourSlides')}
    >
      <div className="guide-panel-heading">
        <div
          className="guide-left-navigation"
          role="group"
          aria-label={t('scenario.editor.guideNavigation')}
        >
          {(
            [
              { id: 'structure', Icon: List, label: t('scenario.editor.tourSlides') },
              { id: 'resources', Icon: Image, label: t('scenario.editor.guideResources') },
            ] as const
          ).map(({ id, Icon, label }) => (
            <ContentToolbarButton
              key={id}
              className="guide-section-tab"
              title={label}
              aria-pressed={panels.leftSection === id}
              onClick={() => panels.openLeft(id)}
            >
              <Icon size={16} />
              {panels.leftSection === id && <span>{label}</span>}
            </ContentToolbarButton>
          ))}
        </div>
        <ContentToolbarButton title={t('scenario.editor.close')} onClick={panels.toggleLeft}>
          <X size={16} />
        </ContentToolbarButton>
      </div>
      <div className="guide-panel-scroll">
        {panels.leftSection === 'structure' ? (
          <TourSlideList {...props} />
        ) : (
          <TourResources {...props} />
        )}
      </div>
      <footer className="guide-resource-footer">
        {panels.leftSection === 'resources' ? (
          <GuideImageUpload
            compact
            placement={{ kind: 'tour-slides' }}
            disabled={importDisabled}
            onUpload={props.onUpload}
            t={t}
          />
        ) : (
          <>
            <div className="tour-list-actions">
              <ContentToolbarButton
                disabled={disabled}
                title={t('scenario.editor.tourAddImageSlide')}
                onClick={() => state.add('image')}
              >
                <Plus size={16} />
              </ContentToolbarButton>
              <ContentToolbarButton
                disabled={disabled}
                title={t('scenario.editor.tourAddNavigation')}
                onClick={() => state.add('navigation')}
              >
                <ListPlus size={16} />
              </ContentToolbarButton>
              <ProductActionButton
                compact
                tone="secondary"
                disabled={disabled || !project.items.length}
                onClick={props.onGenerate}
              >
                {t('scenario.editor.tourGenerate')}
              </ProductActionButton>
            </div>
          </>
        )}
      </footer>
    </FloatingChromePanel>
  );
}

function TourSlideList({
  project,
  state,
  images,
  onSelect,
  disabled,
  t,
  panels,
}: LibraryProps & {
  state: ReturnType<typeof useTourSelection>;
  onSelect: (id: string) => void;
}) {
  const [dragged, setDragged] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const remove = (slideId: string) => {
    if (project.tour && getTourIncomingReferences(project.tour, slideId).length)
      setRemoving(slideId);
    else state.command({ kind: 'remove-slide', slideId, incoming: 'reject' });
  };
  return (
    <nav className="tour-slide-list" aria-label={t('scenario.editor.tourSlides')}>
      {project.tour?.slides.map((slide, index) => {
        const image = slide.kind === 'image' ? slide.image : slide.background.image;
        return (
          <div
            className="tour-slide-row"
            key={slide.id}
            data-tour-before={slide.id}
            onDragOver={(event) => {
              if (dragged) {
                event.preventDefault();
                event.stopPropagation();
              }
            }}
            onDrop={(event) => {
              if (!dragged || disabled) return;
              event.preventDefault();
              event.stopPropagation();
              state.command({ kind: 'move-slide', slideId: dragged, beforeId: slide.id });
              setDragged(null);
            }}
          >
            <TourSlideMoveHandle
              slideId={slide.id}
              index={index}
              slides={project.tour?.slides ?? []}
              disabled={disabled}
              t={t}
              command={state.command}
              onDrag={setDragged}
            />
            <button
              className="tour-slide-select"
              aria-current={
                state.selection?.kind === 'slide' && state.selection.slideId === slide.id
                  ? 'step'
                  : undefined
              }
              onClick={() => onSelect(slide.id)}
            >
              <span className="tour-slide-number">{index + 1}</span>
              {image && images[image.assetId] ? (
                <img src={images[image.assetId]!} alt="" />
              ) : (
                <List size={18} />
              )}
              <span>{slide.title || t('scenario.editor.tourUntitled')}</span>
            </button>
            <ContentToolbarButton
              disabled={disabled}
              title={t('scenario.editor.tourDuplicate')}
              onClick={() => {
                const newId = crypto.randomUUID();
                if (state.command({ kind: 'duplicate-slide', slideId: slide.id, newId }))
                  onSelect(newId);
              }}
            >
              <Copy size={14} />
            </ContentToolbarButton>
            <ContentToolbarButton
              disabled={disabled}
              title={t('common.actions.delete')}
              onClick={() => remove(slide.id)}
            >
              <Trash2 size={14} />
            </ContentToolbarButton>
          </div>
        );
      })}
      {dragged && (
        <div
          className="tour-slide-end-drop"
          onDragOver={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!disabled) state.command({ kind: 'move-slide', slideId: dragged });
            setDragged(null);
          }}
        >
          {t('scenario.editor.tourAppend')}
        </div>
      )}
      {project.tour && (
        <button
          className="tour-object-row"
          aria-current={state.selection?.kind === 'end' ? 'step' : undefined}
          onClick={() => {
            state.select({ kind: 'end' });
            panels.selectRightScope('selection');
          }}
        >
          <Flag size={16} />
          {t('scenario.editor.tourEnd')}
        </button>
      )}
      {removing && (
        <div role="alert" className="tour-review-notice">
          <p>{t('scenario.editor.tourRemoveLinked')}</p>
          {project.tour && <TourIncomingLinks tour={project.tour} targetId={removing} t={t} />}
          <ProductActionButton compact tone="secondary" onClick={() => setRemoving(null)}>
            {t('common.actions.cancel')}
          </ProductActionButton>
          <ProductActionButton
            compact
            tone="danger"
            disabled={disabled}
            onClick={() => {
              state.command({ kind: 'remove-slide', slideId: removing, incoming: 'clear' });
              setRemoving(null);
            }}
          >
            {t('common.actions.delete')}
          </ProductActionButton>
        </div>
      )}
    </nav>
  );
}

/** Keeps pointer and keyboard reordering on the same canonical move command. */
function TourSlideMoveHandle({
  slideId,
  index,
  slides,
  disabled,
  t,
  command,
  onDrag,
}: {
  slideId: string;
  index: number;
  slides: TourSlide[];
  disabled: boolean;
  t: Translate;
  command: ReturnType<typeof useTourSelection>['command'];
  onDrag: (id: string | null) => void;
}) {
  return (
    <ContentToolbarButton
      draggable={!disabled}
      disabled={disabled}
      title={t('scenario.editor.tourMoveSlide')}
      onKeyDown={(event) => {
        if (disabled) return;
        const destination =
          event.key === 'ArrowUp'
            ? index - 1
            : event.key === 'ArrowDown'
              ? index + 1
              : event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? slides.length - 1
                  : null;
        if (destination === null) return;
        event.preventDefault();
        if (destination < 0 || destination >= slides.length || destination === index) return;
        const remaining = slides.filter((entry) => entry.id !== slideId);
        command({
          kind: 'move-slide',
          slideId,
          ...(remaining[destination] ? { beforeId: remaining[destination].id } : {}),
        });
      }}
      onDragStart={(event) => {
        onDrag(slideId);
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('application/x-sniptale-tour-slide', slideId);
      }}
      onDragEnd={() => onDrag(null)}
    >
      <GripVertical size={14} />
    </ContentToolbarButton>
  );
}

/** Identifies affected source slides and authored actions before clearing navigation links. */
function TourIncomingLinks({
  tour,
  targetId,
  t,
}: {
  tour: TourDocument;
  targetId: string;
  t: Translate;
}) {
  const incoming = new Set(getTourIncomingReferences(tour, targetId));
  return (
    <ul>
      {tour.slides.flatMap((slide, index) => {
        if (slide.id === targetId) return [];
        const source = `${index + 1}. ${slide.title || t('scenario.editor.tourUntitled')}`;
        const objects = slide.kind === 'image' ? slide.hotspots : slide.buttons;
        return [
          ...(incoming.has(slide.id)
            ? [
                <li key={`timing-${slide.id}`}>
                  {source} — {t('scenario.editor.tourAutomaticTransition')}
                </li>,
              ]
            : []),
          ...objects
            .filter((object) => incoming.has(object.id))
            .map((object) => (
              <li key={object.id}>
                {source} — {object.label || t('scenario.editor.tourButton')}
              </li>
            )),
        ];
      })}
    </ul>
  );
}
