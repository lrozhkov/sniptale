import { getTourAudioResources } from '../../../features/scenario/project/public';
import { TourNarrationSettings } from './narration-settings';
import { TourLibraryPanel } from './library';
import { useState, type ReactNode } from 'react';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { TourSlide } from '@sniptale/runtime-contracts/scenario/types/tour';
import type {
  importScenarioImages,
  importScenarioNarration,
} from '../../../composition/persistence/scenario/store/public';
import { FloatingChromePanel } from '@sniptale/ui/floating-chrome';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { X, Settings2, Image } from 'lucide-react';
import { ScenarioWorkspaceFrame } from '../workspace';
import type { useGuidePanels } from '../panel-layout';
import { GuideResourceDrawer } from '../resource-drawer';
import { GuideImageUpload } from '../image-upload';
import { TourStage } from './stage';
import { TourInspector } from './inspector';
import { TourGeneration } from './generation';
import { TourImageDropZone } from './image-drop';
import { useTourSelection } from './selection';
import type { Translate } from '../../../platform/i18n';
import './tour.css';

type TourWorkspaceProps = {
  onImportNarration?: (
    input: Omit<Parameters<typeof importScenarioNarration>[0], 'project' | 'baseUpdatedAt'>
  ) => Promise<boolean>;
  initialSlideId?: string | null;
  onEditImage?: (slideId: string) => void;
  project: GuideProject;
  images: Record<string, string | null>;
  panels: ReturnType<typeof useGuidePanels>;
  header: ReactNode;
  disabled: boolean;
  importDisabled?: boolean;
  t: Translate;
  onChange: (project: GuideProject, group?: string | null) => void;
  onImport: (
    input: Omit<Parameters<typeof importScenarioImages>[0], 'project' | 'baseUpdatedAt'>
  ) => Promise<boolean>;
};

/** Tour editing uses the page's existing buffer, resource drawer and panel frame. */
export function TourWorkspace(props: TourWorkspaceProps) {
  const { project, panels, disabled, importDisabled = disabled, t, onChange, onImport } = props;
  const state = useTourSelection(project, disabled, onChange, props.initialSlideId);
  const [generating, setGenerating] = useState(false);
  const selectSlide = (slideId: string) => {
    state.select({ kind: 'slide', slideId, objectId: null });
    panels.selectRightScope('selection');
  };
  const selectObject = (objectId: string | null) => {
    if (!state.slide) return;
    state.select({ kind: 'slide', slideId: state.slide.id, objectId });
    panels.openRight('selection');
  };
  const upload = (file: File, signal: AbortSignal) =>
    onImport({ sources: [{ kind: 'file', file }], placement: { kind: 'tour-slides' }, signal });
  return (
    <GuideResourceDrawer t={t} disabled={importDisabled} selectedStepId={null} onImport={onImport}>
      <TourImageDropZone
        project={project}
        disabled={importDisabled}
        t={t}
        onChange={onChange}
        onImport={(sources, placement, signal) => onImport({ sources, placement, signal })}
      >
        <ScenarioWorkspaceFrame
          panels={panels}
          header={props.header}
          t={t}
          left={
            <TourLibraryPanel
              {...props}
              state={state}
              onSelect={selectSlide}
              onGenerate={() => setGenerating(true)}
              onUpload={upload}
            />
          }
          right={<TourSettingsPanel {...props} state={state} onSelectObject={selectObject} />}
        >
          <TourCanvas
            {...props}
            state={state}
            onSelectObject={selectObject}
            generating={generating}
            onGenerationChange={setGenerating}
            onUpload={upload}
          />
          {state.failed && (
            <p role="alert" className="tour-operation-error">
              {t('scenario.editor.guideOperationFailed')}
            </p>
          )}
        </ScenarioWorkspaceFrame>
      </TourImageDropZone>
    </GuideResourceDrawer>
  );
}

type SelectedTourProps = TourWorkspaceProps & {
  state: ReturnType<typeof useTourSelection>;
  onSelectObject: (id: string | null) => void;
};

function TourSettingsPanel({
  project,
  panels,
  disabled,
  importDisabled = disabled,
  t,
  onImport,
  onEditImage,
  onImportNarration,
  images,
  state,
  onSelectObject: selectObject,
}: SelectedTourProps) {
  const imageDestination = state.slide
    ? {
        kind: state.slide.kind === 'image' ? ('tour-image' as const) : ('tour-background' as const),
        slideId: state.slide.id,
      }
    : null;
  const selectedImage =
    state.slide?.kind === 'image' ? state.slide.image : state.slide?.background.image;
  const inspectorTitle =
    panels.rightScope === 'document'
      ? t('scenario.editor.tourSettings')
      : state.selection?.kind === 'end'
        ? t('scenario.editor.tourEnd')
        : selectedTitle(
            state.slide,
            state.selection?.kind === 'slide' ? state.selection.objectId : null,
            t
          );
  return (
    <FloatingChromePanel
      role="complementary"
      id="guide-inspector-panel"
      className="guide-inspector-panel"
      hidden={!panels.rightOpen}
      aria-label={inspectorTitle}
    >
      <div className="guide-panel-heading">
        <Settings2 size={16} />
        <h2 title={inspectorTitle}>{inspectorTitle}</h2>
        <ContentToolbarButton title={t('scenario.editor.close')} onClick={panels.toggleRight}>
          <X size={16} />
        </ContentToolbarButton>
      </div>
      <div className="guide-panel-scroll">
        {project.tour && (
          <TourInspector
            tour={project.tour}
            slide={state.slide}
            selection={state.selection}
            scope={panels.rightScope}
            disabled={disabled}
            t={t}
            onChangeTour={state.changeTour}
            onChangeSlide={state.changeSlide}
            onSelectObject={selectObject}
          />
        )}
        {panels.rightOpen &&
          panels.rightScope === 'selection' &&
          state.selection?.kind === 'slide' &&
          state.slide &&
          onImportNarration && (
            <TourNarrationSettings
              key={`${project.id}:${state.slide.id}:${state.selection.objectId ?? 'slide'}`}
              slide={state.slide}
              objectId={state.selection.objectId}
              resources={project.tour ? getTourAudioResources(project.tour) : []}
              disabled={disabled}
              importDisabled={importDisabled}
              onImport={onImportNarration}
              onChange={state.changeSlide}
              t={t}
            />
          )}
      </div>
      {imageDestination &&
        panels.rightScope === 'selection' &&
        state.selection?.kind === 'slide' &&
        !state.selection.objectId && (
          <footer className="guide-resource-footer">
            {selectedImage && onEditImage && (
              <ProductActionButton
                compact
                tone="secondary"
                data-tour-edit-image={state.slide?.id}
                disabled={disabled || !images[selectedImage.assetId]}
                onClick={() => {
                  if (state.slide) onEditImage(state.slide.id);
                }}
              >
                {t('scenario.editor.guideEditImage')}
              </ProductActionButton>
            )}
            <GuideImageUpload
              compact
              placement={imageDestination}
              disabled={importDisabled}
              t={t}
              onUpload={(file, signal) =>
                onImport({
                  sources: [{ kind: 'file', file }],
                  placement: imageDestination,
                  signal,
                })
              }
            />
          </footer>
        )}
    </FloatingChromePanel>
  );
}

function TourCanvas({
  project,
  images,
  disabled,
  importDisabled = disabled,
  t,
  onChange,
  onImport,
  state,
  onSelectObject: selectObject,
  generating,
  onGenerationChange: setGenerating,
  onUpload: upload,
}: SelectedTourProps & {
  generating: boolean;
  onGenerationChange: (value: boolean) => void;
  onUpload: (file: File, signal: AbortSignal) => Promise<boolean>;
}) {
  return (
    <div
      className="tour-canvas"
      data-tour-drop-slide={state.slide?.id}
      tabIndex={0}
      aria-label={t('scenario.editor.tourMode')}
    >
      {generating ? (
        <TourGeneration
          disabled={disabled}
          project={project}
          onChange={onChange}
          onClose={() => setGenerating(false)}
          t={t}
        />
      ) : project.tour && state.selection ? (
        <>
          <TourStage
            disabled={disabled}
            key={t('scenario.editor.tourMode')}
            tour={project.tour}
            images={images}
            selection={state.selection}
            t={t}
            onSelectObject={selectObject}
            onMoveObject={(id, point) => {
              if (state.slide?.kind === 'image')
                state.changeSlide(moveObject(state.slide, id, point));
            }}
          />
          {state.slide?.kind === 'image' && !state.slide.image && (
            <div className="tour-empty-image">
              <GuideImageUpload
                placement={{ kind: 'tour-image', slideId: state.slide.id }}
                disabled={importDisabled}
                t={t}
                onUpload={(file, signal) =>
                  onImport({
                    sources: [{ kind: 'file', file }],
                    placement: { kind: 'tour-image', slideId: state.slide!.id },
                    signal,
                  })
                }
              />
            </div>
          )}
        </>
      ) : (
        <div className="tour-empty">
          <Image size={36} />
          <h2>{t('scenario.editor.tourEmpty')}</h2>
          <p>{t('scenario.editor.tourEmptyHint')}</p>
          <GuideImageUpload
            compact
            placement={{ kind: 'tour-slides' }}
            disabled={importDisabled}
            onUpload={upload}
            t={t}
          />
          <ProductActionButton
            compact
            tone="secondary"
            disabled={disabled || !project.items.length}
            onClick={() => setGenerating(true)}
          >
            {t('scenario.editor.tourGenerate')}
          </ProductActionButton>
        </div>
      )}
    </div>
  );
}

function selectedTitle(slide: TourSlide | null, id: string | null, t: Translate): string {
  const object =
    slide?.kind === 'image'
      ? [...slide.hotspots, ...slide.annotations, ...slide.masks].find((entry) => entry.id === id)
      : slide?.buttons.find((entry) => entry.id === id);
  return object
    ? ('label' in object
        ? object.label
        : 'text' in object
          ? object.text
          : t('scenario.editor.tourMask')) || t('scenario.editor.tourAnnotation')
    : slide?.title || t('scenario.editor.tourSlide');
}

function moveObject(
  slide: Extract<TourSlide, { kind: 'image' }>,
  id: string,
  point: { x: number; y: number }
) {
  return {
    ...slide,
    hotspots: slide.hotspots.map((entry) => (entry.id === id ? { ...entry, point } : entry)),
    annotations: slide.annotations.map((entry) =>
      entry.id === id ? { ...entry, anchor: point } : entry
    ),
    masks: slide.masks.map((entry) =>
      entry.id === id ? { ...entry, rect: { ...entry.rect, ...point } } : entry
    ),
  };
}
