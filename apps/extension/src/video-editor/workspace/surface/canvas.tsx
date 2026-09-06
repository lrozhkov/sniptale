import { useWorkspaceTrackPresentation } from './track-presentation';
import {
  WorkspacePanelDockToggle,
  WorkspacePanelResizeHandle,
  type WorkspacePanelResize,
} from '../floating/panel-layout';
import React, { useEffect, useState } from 'react';
import { SegmentedSwitch } from '@sniptale/ui/segmented-switch';
import { translate } from '../../../platform/i18n';
import { VideoEditorSourceViewer } from './source-viewer';
import { ProjectTimeline } from '../../timeline/project';
import { PreviewStage } from '../../preview/stage';
import {
  useVideoEditorHeaderController,
  useWorkspacePreviewContext,
  useVideoEditorBlockingOverlayContext,
  useVideoEditorLayoutController,
  useVideoEditorPreviewController,
  useVideoEditorTimelineController,
} from '../../runtime/controller/composition/hooks';
import {
  useVideoEditorEffectEditingPort,
  useVideoEditorTimelineEditingPort,
} from '../../runtime/controller/store';
import { VideoEditorMaterials } from './materials';
import type { VideoPreviewCanvasInsertKind } from '../../preview/stage/types';
import { VideoEditorWorkspaceEffectsLibrary } from './effects-library';
import type { WorkspaceEffectBundlesState } from './effect-bundles';
import { getProjectTimelineProps } from './timeline-props';
import type { VideoEditorEffectDocumentDragPayload } from '../../contracts/effect-document-drag';
import type { VideoProjectEffectTarget } from '../../../features/video/project/effect-instance/types';
import type { EffectLibraryOperations } from '../../library/effects-dock/operations';
import type { VideoEditorEffectCatalogItem } from '../../library/effects-dock/types';
import type { EffectEditingPort } from '../../contracts/controller-store';

export function VideoEditorWorkspaceCanvas(props: VideoEditorWorkspaceCanvasProps) {
  const layout = useVideoEditorLayoutController();
  const preview = useVideoEditorPreviewController();
  const viewer = useWorkspacePreviewContext();
  const previewHeight = props.previewHeightStyle.height ?? '60%';
  return (
    <div data-ui="video-editor.workspace.canvas-shell" className="min-h-0 min-w-0 flex-1 px-3 pb-3">
      <div
        ref={layout.workspaceSplitRef}
        className="grid h-full min-h-0 min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] gap-0"
        data-materials-dock={props.materialsPanel.fullHeight ? 'full' : 'viewer'}
        data-inspector-dock={props.inspectorFullHeight ? 'full' : 'viewer'}
        style={{
          gridTemplateRows: `minmax(0, min(${previewHeight}, calc(100% - 228px))) 8px minmax(220px, 1fr)`,
        }}
      >
        <div data-ui="video-editor.workspace.upper" className="contents">
          <VideoEditorWorkspaceUpper key={preview?.project.id ?? 'empty'} {...props} />
        </div>
        <div
          className="col-start-3 row-start-1 flex min-h-0 min-w-0"
          style={{ gridRowEnd: props.inspectorFullHeight ? 4 : 2 }}
        >
          {props.inspector}
        </div>
        <div
          className="col-start-1 row-start-2"
          style={{
            gridColumnStart: props.materialsPanel.fullHeight ? 2 : 1,
            gridColumnEnd: props.inspectorFullHeight ? 3 : 4,
          }}
        >
          <VideoEditorWorkspaceResizeHandle
            onPointerDown={layout.handleStartVerticalResize}
            onDoubleClick={viewer.resetPaneHeight}
            onKeyDown={viewer.handleVerticalResizeKeyDown}
          />
        </div>
        <div
          className="col-start-1 row-start-3 flex min-h-0 min-w-0"
          onPointerDownCapture={() => viewer.setSourceViewerActive(false)}
          onFocusCapture={() => viewer.setSourceViewerActive(false)}
          style={{
            gridColumnStart: props.materialsPanel.fullHeight ? 2 : 1,
            gridColumnEnd: props.inspectorFullHeight ? 3 : 4,
          }}
        >
          <VideoEditorWorkspaceTimeline {...props} />
        </div>
      </div>
    </div>
  );
}

interface VideoEditorWorkspaceCanvasProps {
  materialsPanel: { resize: WorkspacePanelResize; fullHeight: boolean; onToggle: () => void };
  inspectorFullHeight?: boolean;
  materialsOpen?: boolean;
  inspector: React.ReactNode;
  activeInsertKind: VideoPreviewCanvasInsertKind | null;
  effectBundles: WorkspaceEffectBundlesState;
  effectOperations: EffectLibraryOperations;
  effectsLibraryDockOpen: boolean;
  previewHeightStyle: React.CSSProperties;
  onClearActiveInsertKind: () => void;
  onEffectsLibraryDockOpenChange: (open: boolean) => void;
}

function VideoEditorWorkspaceUpper(props: VideoEditorWorkspaceCanvasProps) {
  const header = useVideoEditorHeaderController();
  const preview = useVideoEditorPreviewController();
  const viewer = useWorkspacePreviewContext();
  const blocking = useVideoEditorBlockingOverlayContext();
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const appendMaterial = useVideoEditorTimelineEditingPort((port) => port.appendMaterial);
  const insertMaterial = useVideoEditorTimelineEditingPort((port) => port.insertMaterial);
  const overlayMaterial = useVideoEditorTimelineEditingPort((port) => port.overlayMaterial);
  const setSourceActive = viewer.setSourceViewerActive;
  useEffect(() => () => setSourceActive(false), [setSourceActive]);
  const source = preview?.project.assets.find(({ id }) => id === selectedAssetId) ?? null;
  useEffect(() => {
    if (!source) setSourceActive(false);
  }, [source, setSourceActive]);
  if (!preview) return <div className="min-h-0 min-w-0 flex-1" />;
  const sourceActive = viewer.sourceViewerActive && source !== null;
  const showSource = () => {
    preview.transport.onPausePlayback();
    setSourceActive(true);
  };
  const viewerHeading = (
    <WorkspaceViewerHeading
      sourceName={source?.name ?? null}
      sourceActive={sourceActive}
      onChange={(active) => (active ? showSource() : setSourceActive(false))}
    />
  );
  return (
    <>
      {(props.materialsOpen || props.effectsLibraryDockOpen) && (
        <div
          className="col-start-1 row-start-1 flex min-h-0 min-w-0"
          style={{ gridRowEnd: props.materialsPanel.fullHeight ? 4 : 2 }}
        >
          <div className="min-h-0 min-w-0" style={{ width: props.materialsPanel.resize.width }}>
            {props.materialsOpen && (
              <VideoEditorMaterials
                onOpenLibrary={() => header?.onOpenLibraryPanel()}
                project={preview.project}
                onImport={preview.onImport}
                selectedAssetId={selectedAssetId}
                headerAction={
                  <WorkspacePanelDockToggle
                    fullHeight={props.materialsPanel.fullHeight}
                    onToggle={props.materialsPanel.onToggle}
                    dataUi="video-editor.materials.dock-toggle"
                  />
                }
                onSelect={(asset) => {
                  setSelectedAssetId(asset.id);
                  showSource();
                }}
              />
            )}
            <VideoEditorWorkspaceEffectsLibrary
              effectBundles={props.effectBundles}
              effectOperations={props.effectOperations}
              isOpen={props.effectsLibraryDockOpen}
              onOpenChange={props.onEffectsLibraryDockOpenChange}
              headerAction={
                <WorkspacePanelDockToggle
                  fullHeight={props.materialsPanel.fullHeight}
                  onToggle={props.materialsPanel.onToggle}
                  dataUi="video-editor.materials.dock-toggle"
                />
              }
            />
          </div>
          <WorkspacePanelResizeHandle
            resize={props.materialsPanel.resize}
            label={translate('videoEditor.app.resizeMaterials')}
            dataUi="video-editor.materials.resize"
          />
        </div>
      )}
      <div
        className="col-start-2 row-start-1 flex min-h-0 min-w-0 flex-col"
        data-ui="video-editor.workspace.viewer"
        data-viewer={sourceActive ? 'source' : 'montage'}
      >
        <PreviewStage
          headerContent={viewerHeading}
          alternateView={{
            active: sourceActive,
            content: (
              <VideoEditorSourceViewer
                asset={source}
                assetUrl={source ? preview.assetUrls[source.id] : undefined}
                active={sourceActive && !blocking}
                fps={preview.project.fps}
                onAppend={appendMaterial}
                onInsert={insertMaterial}
                onOverlay={overlayMaterial}
                onPlaced={() => setSourceActive(false)}
              />
            ),
          }}
          {...createWorkspacePreviewProps(props, preview)}
        />
      </div>
    </>
  );
}

function createWorkspacePreviewProps(
  props: VideoEditorWorkspaceCanvasProps,
  preview: NonNullable<ReturnType<typeof useVideoEditorPreviewController>>
): React.ComponentProps<typeof PreviewStage> {
  return {
    activeInsertKind: props.activeInsertKind,
    assetUrls: preview.assetUrls,
    currentTime: preview.transport.currentTime,
    grid: preview.grid,
    isPlaying: preview.transport.isPlaying,
    playbackRange: preview.transport.playbackRange,
    placementMode: preview.selection.placementMode,
    project: preview.project,
    previewMode: preview.preferences.mode,
    previewPreferencesSaveFailed: preview.preferences.saveFailed,
    previewRasterPreset: preview.preferences.rasterPreset,
    previewZoom: preview.preferences.zoom,
    registerPreviewRuntime: preview.transport.registerPreviewRuntime,
    selectedActionEvent: preview.selection.selectedActionEvent,
    selectedClipId: preview.selection.selectedClipId,
    selectedMotionRegion: preview.selection.selectedMotionRegion,
    onClearActiveInsertKind: props.onClearActiveInsertKind,
    ...preview.editing,
    onImport: preview.onImport,
    ...createWorkspacePreviewActions(preview),
  };
}

function createWorkspacePreviewActions(
  preview: NonNullable<ReturnType<typeof useVideoEditorPreviewController>>
): Pick<
  React.ComponentProps<typeof PreviewStage>,
  | 'onClearPlacementMode'
  | 'onPausePlayback'
  | 'onPreviewModeChange'
  | 'onPreviewPreferencesRetry'
  | 'onPreviewRasterPresetChange'
  | 'onPreviewZoomChange'
  | 'onSeek'
  | 'onSelectClip'
  | 'onSelectScene'
  | 'onTogglePlay'
  | 'onUpdateActionEventDetails'
  | 'onUpdateMotionRegion'
  | 'onUpsertObjectTrackCorrectionAnchor'
> {
  return {
    onClearPlacementMode: preview.pointAuthoring.onClearPlacementMode,
    onPausePlayback: preview.transport.onPausePlayback,
    onPreviewModeChange: preview.preferences.onModeChange,
    onPreviewPreferencesRetry: preview.preferences.onRetrySave,
    onPreviewRasterPresetChange: preview.preferences.onRasterPresetChange,
    onPreviewZoomChange: preview.preferences.onZoomChange,
    onSeek: preview.transport.onSeek,
    onSelectClip: preview.selection.onSelectClip,
    onSelectScene: preview.selection.onSelectScene,
    onTogglePlay: preview.transport.onTogglePlay,
    onUpdateActionEventDetails: preview.pointAuthoring.onUpdateActionEventDetails,
    onUpdateMotionRegion: preview.pointAuthoring.onUpdateMotionRegion,
    onUpsertObjectTrackCorrectionAnchor: preview.pointAuthoring.onUpsertObjectTrackCorrectionAnchor,
  };
}

function VideoEditorWorkspaceTimeline(props: VideoEditorWorkspaceCanvasProps): React.JSX.Element {
  const controller = useVideoEditorTimelineController();
  const presentation = useWorkspaceTrackPresentation();
  const onApplyEffectDocument = useVideoEditorEffectEditingPort((port) => port.applyEffectDocument);
  if (!controller || !presentation) return <div className="min-h-[220px] min-w-0 flex-1" />;
  return (
    <div className="min-h-[220px] min-w-0 flex-1">
      <ProjectTimeline
        panelPrefs={presentation.panelPrefs}
        {...getProjectTimelineProps(
          controller,
          (payload, target, startTime) =>
            void applyDroppedEffectDocument({
              catalogs: props.effectBundles.catalogs,
              onApplyEffectDocument,
              operations: props.effectOperations,
              payload,
              startTime,
              target,
            })
        )}
      />
    </div>
  );
}

interface ApplyDroppedEffectDocumentArgs {
  catalogs: readonly VideoEditorEffectCatalogItem[];
  onApplyEffectDocument: EffectEditingPort['applyEffectDocument'];
  operations: EffectLibraryOperations;
  payload: VideoEditorEffectDocumentDragPayload;
  startTime: number;
  target: VideoProjectEffectTarget;
}

export async function applyDroppedEffectDocument(
  args: ApplyDroppedEffectDocumentArgs
): Promise<void> {
  const item = args.catalogs.find(
    (candidate) =>
      candidate.status === 'ready' &&
      candidate.catalog.enabled &&
      candidate.catalog.packId === args.payload.packId
  );
  const catalog = item?.status === 'ready' ? item.catalog : null;
  const document = catalog?.documents.find(
    ({ id, kind }) => id === args.payload.documentId && kind === args.payload.kind
  );
  if (!catalog || !document || !doesEffectKindMatchTarget(document.kind, args.target)) return;
  await args.operations.run('apply', () =>
    args.onApplyEffectDocument({
      catalog,
      documentId: document.id,
      startTime: args.startTime,
      target: args.target,
    })
  );
}

function doesEffectKindMatchTarget(
  kind: VideoEditorEffectDocumentDragPayload['kind'],
  target: VideoProjectEffectTarget
): boolean {
  return (
    (kind === 'standalone' && target.kind === 'scene') ||
    (kind === 'targetEffect' && target.kind === 'clip') ||
    (kind === 'transition' && target.kind === 'transition')
  );
}

function VideoEditorWorkspaceResizeHandle({
  onPointerDown,
  onDoubleClick,
  onKeyDown,
}: {
  onPointerDown: React.PointerEventHandler<HTMLDivElement>;
  onDoubleClick: () => void;
  onKeyDown: React.KeyboardEventHandler<HTMLDivElement>;
}): React.JSX.Element {
  return (
    <div
      data-ui="video-editor.workspace.timeline-resize-zone"
      role="separator"
      aria-orientation="horizontal"
      aria-label={translate('videoEditor.app.resizeTimeline')}
      tabIndex={0}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      className="h-2 shrink-0 cursor-row-resize"
    />
  );
}

function WorkspaceViewerHeading({
  sourceName,
  sourceActive,
  onChange,
}: {
  sourceName: string | null;
  sourceActive: boolean;
  onChange: (source: boolean) => void;
}) {
  return (
    <div className="flex h-9 min-w-0 flex-1 items-center gap-2">
      {sourceName !== null ? (
        <SegmentedSwitch
          density="compact"
          ariaLabel={translate('videoEditor.app.viewerSwitch')}
          activeId={sourceActive ? 'source' : 'montage'}
          options={[
            { id: 'source', label: translate('videoEditor.app.sourceViewer') },
            { id: 'montage', label: translate('videoEditor.app.montageViewer') },
          ]}
          onChange={(id) => onChange(id === 'source')}
        />
      ) : (
        <span className="text-xs font-semibold">{translate('videoEditor.app.montageViewer')}</span>
      )}
      {sourceActive && sourceName ? (
        <span
          className="min-w-0 truncate text-xs text-[var(--sniptale-color-text-muted)]"
          title={sourceName}
        >
          {sourceName}
        </span>
      ) : null}
    </div>
  );
}
