import {
  getTourAudioResources,
  getTourActionTitle,
  getScenarioNarrationText,
  listScenarioNarrationTexts,
  type ScenarioNarrationText,
} from '../../../features/scenario/project/public';
import { TourNarrationPlacement } from './narration-recording';
import { TourMusicSettings } from './music-settings';
import { TourNarrationSettings } from './narration-settings';
import { TourLibraryPanel } from './library';
import { useRef, useState } from 'react';
import type { TourSlide } from '@sniptale/runtime-contracts/scenario/types/tour';
import { FloatingChromePanel } from '@sniptale/ui/floating-chrome';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { X, Settings2, SquarePen, ArrowLeft } from 'lucide-react';
import { GuideInspectorPresentationToggle, ScenarioWorkspaceFrame } from '../workspace';
import { GuideResourceDrawer, GuideResourceTrigger } from '../resource-drawer';
import { TourViewControls, useTourViewMode } from './view-controls';
import { TourInspector } from './inspector';
import { TourImageDropZone } from './image-drop';
import { useTourSelection } from './selection';
import type { Translate } from '../../../platform/i18n';
import { TourCanvas } from './canvas';
import type { TourWorkspaceProps, SelectedTourProps } from './workspace-contracts';
import './tour.css';
import { TourNarrationAI } from './narration-ai';

/** Tour editing uses the page's existing buffer, resource drawer and panel frame. */
export function TourWorkspace(props: TourWorkspaceProps) {
  const { project, panels, disabled, importDisabled = disabled, t, onChange, onImport } = props;
  const state = useTourSelection(project, disabled, onChange, props.initialSlideId);
  const view = useTourViewMode(state.selection, state.slide);
  const [generating, setGenerating] = useState(false);
  const [aiTargets, setAITargets] = useState<ScenarioNarrationText[] | null>(null);
  const aiOrigin = useRef<HTMLElement | null>(null);
  const openAI = (targets: ScenarioNarrationText[]) => {
    aiOrigin.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setAITargets(targets);
    panels.openRight(panels.rightScope);
  };
  const closeAI = () => {
    setAITargets(null);
    requestAnimationFrame(() => {
      if (aiOrigin.current?.isConnected) aiOrigin.current.focus();
      else
        document
          .getElementById('guide-inspector-panel')
          ?.querySelector<HTMLButtonElement>('[data-ai-single]')
          ?.focus();
    });
  };
  const [recording, setRecording] = useState(false);
  const recordingOrigin = useRef<boolean | null>(null);
  const [recordingHost, setRecordingHost] = useState<HTMLDivElement | null>(null);
  const selectedImage =
    state.slide?.kind === 'image' ? state.slide.image : state.slide?.background.image;
  const editImage =
    state.slide && selectedImage && props.onEditImage
      ? { slideId: state.slide.id, disabled: disabled || !props.images[selectedImage.assetId] }
      : null;
  const selectSlide = (slideId: string) => {
    setAITargets(null);
    state.select({ kind: 'slide', slideId, objectId: null });
    panels.selectRightScope('selection');
  };
  const selectObject = (objectId: string | null) => {
    if (!state.slide) return;
    setAITargets(null);
    state.select({ kind: 'slide', slideId: state.slide.id, objectId });
    panels.openRight('selection');
  };
  const upload = (file: File, signal: AbortSignal) =>
    onImport({ sources: [{ kind: 'file', file }], placement: { kind: 'tour-slides' }, signal });
  return (
    <TourNarrationPlacement.Provider
      value={{
        host: recordingHost,
        setActive: (active) => {
          if (active) {
            recordingOrigin.current ??= panels.rightOpen;
            panels.openRight(panels.rightScope);
          } else {
            if (recordingOrigin.current === false && panels.rightOpen) panels.toggleRight();
            recordingOrigin.current = null;
          }
          setRecording(active);
        },
      }}
    >
      <GuideResourceDrawer
        t={t}
        disabled={importDisabled}
        selectedStepId={null}
        onImport={onImport}
      >
        <TourImageDropZone
          project={project}
          disabled={importDisabled || recording}
          t={t}
          onChange={onChange}
          onImport={(sources, placement, signal) => onImport({ sources, placement, signal })}
        >
          <ScenarioWorkspaceFrame
            interactionBlocked={recording}
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
                  beginningDisabled={
                    !project.tour?.slides.some(
                      (slide) => slide.kind === 'navigation' || slide.actions.length > 0
                    )
                  }
                  disabled={disabled}
                  t={t}
                />
                {props.narrationAI && (
                  <ContentToolbarButton
                    className="guide-labeled-action"
                    title={t('scenario.editor.tourNarrationAIBatch')}
                    data-ai-batch
                    disabled={importDisabled || !listScenarioNarrationTexts(project).length}
                    onClick={() => openAI(listScenarioNarrationTexts(project))}
                  >
                    <span>{t('scenario.editor.tourNarrationAIBatch')}</span>
                  </ContentToolbarButton>
                )}
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
                {state.slide && (
                  <GuideResourceTrigger
                    t={t}
                    disabled={importDisabled}
                    title={t('scenario.editor.guideReplaceImage')}
                    target={{
                      kind: state.slide.kind === 'image' ? 'tour-image' : 'tour-background',
                      slideId: state.slide.id,
                    }}
                  />
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
            right={
              <>
                <div style={{ display: recording ? 'none' : 'contents' }} inert={recording}>
                  <TourSettingsPanel
                    {...props}
                    state={state}
                    onSelectObject={selectObject}
                    aiTargets={aiTargets}
                    onOpenAI={openAI}
                    onCloseAI={closeAI}
                  />
                </div>
                <FloatingChromePanel
                  id="tour-recording-inspector"
                  className="guide-inspector-panel tour-inspector-panel sniptale-inspector-surface"
                  hidden={!recording}
                >
                  <div ref={setRecordingHost} className="h-full min-h-0 min-w-0" />
                </FloatingChromePanel>
              </>
            }
          >
            <TourCanvas
              {...props}
              state={state}
              view={view.view}
              previewKey={view.replay}
              previewOrigin={view.previewOrigin}
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
    </TourNarrationPlacement.Provider>
  );
}

function TourSettingsPanel({
  images,
  project,
  panels,
  disabled,
  importDisabled = disabled,
  t,
  onImportNarration,
  onImport,
  state,
  onSelectObject: selectObject,
  narrationAI,
  aiTargets,
  onOpenAI,
  onCloseAI,
}: SelectedTourProps & {
  aiTargets: ScenarioNarrationText[] | null;
  onOpenAI(targets: ScenarioNarrationText[]): void;
  onCloseAI(): void;
}) {
  const inspectorTitle = aiTargets
    ? t('scenario.editor.tourNarrationAI')
    : panels.rightScope === 'document'
      ? t('scenario.editor.tourSettings')
      : state.selection?.kind === 'end'
        ? t('scenario.editor.tourEnd')
        : selectedTitle(
            state.slide,
            state.selection?.kind === 'slide' ? state.selection.objectId : null,
            t
          );
  const nested =
    Boolean(aiTargets) ||
    (panels.rightScope === 'selection' &&
      state.selection?.kind === 'slide' &&
      Boolean(state.selection.objectId));
  const grouped = panels.rightScope === 'document' || state.selection?.kind === 'slide';
  return (
    <FloatingChromePanel
      role="complementary"
      id="guide-inspector-panel"
      className="guide-inspector-panel tour-inspector-panel sniptale-inspector-surface"
      hidden={!panels.rightOpen}
      aria-label={inspectorTitle}
    >
      <div className="guide-panel-heading">
        {nested ? (
          <ContentToolbarButton
            className="tour-inspector-back"
            size="compact"
            title={t('scenario.editor.tourBackToSlide')}
            onClick={aiTargets ? onCloseAI : () => selectObject(null)}
          >
            <ArrowLeft size={16} aria-hidden="true" />
          </ContentToolbarButton>
        ) : (
          <Settings2 size={16} />
        )}
        <h2 title={inspectorTitle}>{inspectorTitle}</h2>
        {grouped && (
          <GuideInspectorPresentationToggle
            presentation={panels.presentation}
            onToggle={panels.togglePresentation}
            t={t}
          />
        )}
        <ContentToolbarButton
          tone="close"
          size="compact"
          title={t('scenario.editor.close')}
          onClick={() => {
            if (aiTargets) onCloseAI();
            panels.toggleRight();
          }}
        >
          <X size={16} />
        </ContentToolbarButton>
      </div>
      <div className="guide-panel-scroll">
        {aiTargets && narrationAI && (
          <TourNarrationAI
            key={project.id}
            targets={aiTargets}
            access={narrationAI}
            disabled={importDisabled}
            t={t}
          />
        )}
        <div hidden={Boolean(aiTargets)} inert={Boolean(aiTargets)}>
          {project.tour && (
            <TourInspector
              images={images}
              importDisabled={importDisabled}
              onUploadStage={(file, signal, originMediaId) =>
                onImport({
                  sources: originMediaId
                    ? [{ kind: 'library', mediaId: originMediaId }]
                    : [{ kind: 'file', file }],
                  placement: { kind: 'tour-stage-background' },
                  signal,
                })
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
                onImportNarration &&
                (aiTargets ? (
                  <span />
                ) : (
                  <TourMusicSettings
                    key={project.id}
                    tour={project.tour}
                    disabled={disabled}
                    importDisabled={importDisabled}
                    onChange={state.changeTour}
                    onImport={onImportNarration}
                    t={t}
                  />
                ))
              }
              narration={
                panels.rightOpen &&
                panels.rightScope === 'selection' &&
                state.selection?.kind === 'slide' &&
                state.slide &&
                (state.slide.kind === 'navigation' ||
                  state.slide.actions.some(
                    (entry) =>
                      state.selection?.kind === 'slide' &&
                      entry.object.id === state.selection.objectId
                  )) &&
                onImportNarration &&
                (aiTargets ? (
                  <span />
                ) : (
                  <TourNarrationSettings
                    key={`${project.id}:${state.slide.id}:${state.selection.objectId ?? 'slide'}`}
                    slide={state.slide}
                    objectId={state.selection.objectId}
                    resources={project.tour ? getTourAudioResources(project.tour) : []}
                    disabled={disabled}
                    importDisabled={importDisabled}
                    onImport={onImportNarration}
                    onGenerate={
                      narrationAI &&
                      state.selection.objectId &&
                      getScenarioNarrationText(project, {
                        slideId: state.slide.id,
                        objectId: state.selection.objectId,
                      })
                        ? () => {
                            const target =
                              state.selection?.kind === 'slide' && state.selection.objectId
                                ? getScenarioNarrationText(project, {
                                    slideId: state.slide!.id,
                                    objectId: state.selection.objectId,
                                  })
                                : null;
                            if (target) onOpenAI([target]);
                          }
                        : undefined
                    }
                    onChange={state.changeSlide}
                    t={t}
                  />
                ))
              }
              onSelectObject={selectObject}
            />
          )}
        </div>
      </div>
    </FloatingChromePanel>
  );
}

function selectedTitle(slide: TourSlide | null, id: string | null, t: Translate): string {
  const object =
    slide?.kind === 'image'
      ? slide.actions.find((entry) => entry.object.id === id)?.object
      : slide?.buttons.find((entry) => entry.id === id);
  return object
    ? 'text' in object
      ? getTourActionTitle(
          object,
          t('point' in object ? 'scenario.editor.tourHotspot' : 'scenario.editor.tourAnnotation')
        )
      : object.label
    : slide?.title || t('scenario.editor.tourSlide');
}
