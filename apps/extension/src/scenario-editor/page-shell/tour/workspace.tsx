import { getTourAudioResources } from '../../../features/scenario/project/public';
import { TourMusicSettings } from './music-settings';
import { TourNarrationSettings } from './narration-settings';
import { TourLibraryPanel } from './library';
import { useState } from 'react';
import type { TourSlide } from '@sniptale/runtime-contracts/scenario/types/tour';
import { FloatingChromePanel } from '@sniptale/ui/floating-chrome';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { X, Settings2, List, PanelLeft, SquarePen, Image } from 'lucide-react';
import { ScenarioWorkspaceFrame } from '../workspace';
import { GuideResourceDrawer, useGuideResourceRequest } from '../resource-drawer';
import { ScenarioInspectorActionButton } from '../inspector-actions';
import { TourViewControls, useTourViewMode } from './view-controls';
import { TourInspector } from './inspector';
import { TourImageDropZone } from './image-drop';
import { useTourSelection } from './selection';
import type { Translate } from '../../../platform/i18n';
import { TourCanvas } from './canvas';
import type { TourWorkspaceProps, SelectedTourProps } from './workspace-contracts';
import './tour.css';

/** Tour editing uses the page's existing buffer, resource drawer and panel frame. */
export function TourWorkspace(props: TourWorkspaceProps) {
  const { project, panels, disabled, importDisabled = disabled, t, onChange, onImport } = props;
  const state = useTourSelection(project, disabled, onChange, props.initialSlideId);
  const view = useTourViewMode(state.selection, state.slide);
  const [generating, setGenerating] = useState(false);
  const selectedImage =
    state.slide?.kind === 'image' ? state.slide.image : state.slide?.background.image;
  const editImage =
    state.slide && selectedImage && props.onEditImage
      ? { slideId: state.slide.id, disabled: disabled || !props.images[selectedImage.assetId] }
      : null;
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
          header={props.header(
            <div
              className="tour-header-controls"
              role="group"
              aria-label={t('scenario.editor.tourSlideControls')}
            >
              <TourViewControls
                mode={view}
                previewDisabled={!state.slide}
                disabled={disabled}
                t={t}
              />
              {editImage && (
                <ContentToolbarButton
                  className="guide-labeled-action"
                  title={t('scenario.editor.guideEditImage')}
                  data-tour-edit-image={editImage.slideId}
                  data-header-collapse="3"
                  disabled={editImage.disabled}
                  onClick={() => props.onEditImage?.(editImage.slideId)}
                >
                  <SquarePen size={16} aria-hidden="true" />
                  <span>{t('scenario.editor.guideEditImage')}</span>
                </ContentToolbarButton>
              )}
            </div>
          )}
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
            view={view.view}
            previewKey={view.replay}
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

function TourSettingsPanel({
  images,
  onEditImage,
  project,
  panels,
  disabled,
  importDisabled = disabled,
  t,
  onImportNarration,
  onImport,
  state,
  onSelectObject: selectObject,
}: SelectedTourProps) {
  const slide = state.slide;
  const image = slide?.kind === 'image' ? slide.image : slide?.background.image;
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
  const grouped = panels.rightScope === 'document' || state.selection?.kind === 'slide';
  return (
    <FloatingChromePanel
      role="complementary"
      id="guide-inspector-panel"
      className="guide-inspector-panel tour-inspector-panel"
      hidden={!panels.rightOpen}
      aria-label={inspectorTitle}
    >
      <div className="guide-panel-heading">
        <Settings2 size={16} />
        <h2 title={inspectorTitle}>{inspectorTitle}</h2>
        {grouped && (
          <ContentToolbarButton
            tone="utility"
            size="compact"
            title={t(
              panels.presentation === 'all'
                ? 'scenario.editor.inspectorShowSections'
                : 'scenario.editor.inspectorShowAll'
            )}
            onClick={panels.togglePresentation}
          >
            {panels.presentation === 'all' ? (
              <List size={16} aria-hidden="true" />
            ) : (
              <PanelLeft size={16} aria-hidden="true" />
            )}
          </ContentToolbarButton>
        )}
        <ContentToolbarButton
          tone="close"
          size="compact"
          title={t('scenario.editor.close')}
          onClick={panels.toggleRight}
        >
          <X size={16} />
        </ContentToolbarButton>
      </div>
      <div className="guide-panel-scroll">
        {project.tour && (
          <TourInspector
            importDisabled={importDisabled}
            onUploadStage={(file, signal) =>
              onImport({
                sources: [{ kind: 'file', file }],
                placement: { kind: 'tour-stage-background' },
                signal,
              })
            }
            imageActions={
              slide &&
              image && (
                <TourSelectedImageActions
                  slide={slide}
                  images={images}
                  onEditImage={onEditImage}
                  disabled={disabled}
                  importDisabled={importDisabled}
                  t={t}
                />
              )
            }
            presentation={panels.presentation}
            tour={project.tour}
            slide={state.slide}
            selection={state.selection}
            scope={panels.rightScope}
            disabled={disabled}
            t={t}
            onChangeTour={state.changeTour}
            onChangeSlide={state.changeSlide}
            music={
              onImportNarration && (
                <TourMusicSettings
                  key={project.id}
                  tour={project.tour}
                  disabled={disabled}
                  importDisabled={importDisabled}
                  onChange={state.changeTour}
                  onImport={onImportNarration}
                  t={t}
                />
              )
            }
            narration={
              panels.rightOpen &&
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
              )
            }
            onSelectObject={selectObject}
          />
        )}
      </div>
    </FloatingChromePanel>
  );
}

/** Selected image commands keep target and resource availability separate from panel presentation. */
function TourSelectedImageActions({
  slide,
  images,
  onEditImage,
  disabled,
  importDisabled,
  t,
}: {
  slide: TourSlide;
  images: SelectedTourProps['images'];
  onEditImage: SelectedTourProps['onEditImage'];
  disabled: boolean;
  importDisabled: boolean;
  t: Translate;
}) {
  const requestResource = useGuideResourceRequest();
  const image = slide.kind === 'image' ? slide.image : slide.background.image;
  return (
    <>
      {onEditImage && (
        <ScenarioInspectorActionButton
          data-inspector-edit-image={slide.id}
          disabled={disabled || !image || !images[image.assetId]}
          onClick={() => onEditImage(slide.id)}
        >
          <SquarePen size={16} aria-hidden="true" />
          {t('scenario.editor.guideEditImage')}
        </ScenarioInspectorActionButton>
      )}
      <ScenarioInspectorActionButton
        disabled={importDisabled || !requestResource}
        aria-controls="guide-resource-drawer"
        onClick={() =>
          requestResource?.({
            kind: slide.kind === 'image' ? 'tour-image' : 'tour-background',
            slideId: slide.id,
          })
        }
      >
        <Image size={16} aria-hidden="true" />
        {t('scenario.editor.guideReplaceImage')}
      </ScenarioInspectorActionButton>
    </>
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
