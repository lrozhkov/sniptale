import { WorkspacePanelHeader } from '../floating/panel-header';
import type { ProjectAssetUse } from '../../../features/video/project/media-usage';
import { VideoEditorWorkspaceHeaderActions } from '../floating/top-panels';
import { useWorkspaceTrackPresentation } from './track-presentation';
import React, { useEffect, useState } from 'react';
import { SegmentedSwitch } from '@sniptale/ui/segmented-switch';
import { FloatingChromePanel } from '@sniptale/ui/floating-chrome';
import { translate } from '../../../platform/i18n';
import { VideoEditorSourceViewer } from './source-viewer';
import type { VideoProjectAsset } from '../../../features/video/project/types';
import { ProjectTimeline } from '../../timeline/project';
import type { TimelineClipRevealRequest } from '../../timeline/project/types';
import { PreviewStage } from '../../preview/stage';
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
import { placeMaterialWithTelemetry } from '../../runtime/commands/material-placement';
import {
  getCurrentVideoEditorProjectSnapshot,
  getCurrentVideoEditorCurrentTime,
} from '../../runtime/controller/store';
import {
  VideoEditorWorkspaceHeader,
  VideoEditorLibraryNavigation,
  WorkspacePanelCloseButton,
} from '../floating';
import {
  WorkspacePanelDockToggle,
  WorkspacePanelResizeHandle,
  type WorkspacePanelResize,
} from '../floating/panel-layout';
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

export function VideoEditorWorkspaceCanvas(props: VideoEditorWorkspaceCanvasProps) {
  const [revealClipRequest, setRevealClipRequest] = useState<TimelineClipRevealRequest>();
  const layout = useVideoEditorLayoutController();
  const preview = useVideoEditorPreviewController();
  const viewer = useWorkspacePreviewContext();
  const previewHeight = props.previewHeightStyle.height ?? '60%';
  return (
    <div data-ui="video-editor.workspace.canvas-shell" className="min-h-0 min-w-0 flex-1 p-3">
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
          <VideoEditorWorkspaceUpper
            key={preview?.project.id ?? 'empty'}
            {...props}
            onRevealClip={(clipId) =>
              setRevealClipRequest((previous) => ({ clipId, serial: (previous?.serial ?? 0) + 1 }))
            }
          />
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
          <VideoEditorWorkspaceTimeline {...props} revealClipRequest={revealClipRequest} />
        </div>
      </div>
    </div>
  );
}

interface VideoEditorWorkspaceCanvasProps {
  inspectorPanel: { isOpen: boolean; onToggle: () => void };
  onMaterialsOpenChange: (open: boolean) => void;
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

function VideoEditorWorkspaceUpper(
  props: VideoEditorWorkspaceCanvasProps & { onRevealClip: (clipId: string) => void }
) {
  const recordingLayout = useVideoEditorLayoutController();
  const header = useVideoEditorHeaderController();
  const preview = useVideoEditorPreviewController();
  const viewer = useWorkspacePreviewContext();
  const blocking = useVideoEditorBlockingOverlayContext();
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const removeUnusedAssets = useVideoEditorTimelineEditingPort((port) => port.removeUnusedAssets);
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
    <VideoEditorWorkspaceHeader
      libraryOpen={Boolean(props.materialsOpen || props.effectsLibraryDockOpen)}
      onOpenLibraryPanel={() => props.onMaterialsOpenChange(true)}
      onOpenEffectsPanel={() => props.onEffectsLibraryDockOpenChange(true)}
    >
      {source && (
        <WorkspaceViewerHeading
          source={source}
          onClose={() => {
            setSourceActive(false);
            setSelectedAssetId(null);
            requestAnimationFrame(() =>
              document
                .querySelector<HTMLElement>('[data-ui="video-editor.workspace.viewer"]')
                ?.focus()
            );
          }}
          sourceActive={sourceActive}
          onChange={(active) => (active ? showSource() : setSourceActive(false))}
        />
      )}
    </VideoEditorWorkspaceHeader>
  );
  return (
    <>
      <WorkspaceLibraryPanel {...props}>
        {props.materialsOpen && (
          <VideoEditorMaterials
            onRecordAudio={recordingLayout.openAudioRecordingDialog}
            onShowUse={(use) => {
              preview.transport.onPausePlayback();
              setSourceActive(false);
              setSelectedAssetId(null);
              revealWorkspaceMaterial(use, preview, props.onRevealClip);
              if (use.kind === 'scene' && !props.inspectorPanel.isOpen)
                props.inspectorPanel.onToggle();
            }}
            onRemoveUnused={removeUnusedAssets}
            onOpenLibrary={() => header?.onOpenLibraryPanel()}
            project={preview.project}
            onImport={preview.onImport}
            selectedAssetId={selectedAssetId}
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
        />
      </WorkspaceLibraryPanel>
      <div
        className="col-start-2 row-start-1 flex min-h-0 min-w-0 flex-col"
        tabIndex={-1}
        data-ui="video-editor.workspace.viewer"
        data-viewer={sourceActive ? 'source' : 'montage'}
      >
        <PreviewStage
          headerContent={viewerHeading}
          headerActions={
            <VideoEditorWorkspaceHeaderActions
              inspectorOpen={props.inspectorPanel.isOpen}
              onOpenInspector={props.inspectorPanel.onToggle}
            />
          }
          alternateView={{
            active: sourceActive,
            content: (
              <VideoEditorSourceViewer
                asset={source}
                assetUrl={source ? preview.assetUrls[source.id] : undefined}
                active={sourceActive && !blocking}
                fps={preview.project.fps}
                onAppend={(assetId, range, signal) =>
                  placeMaterialWithTelemetry({
                    assetId,
                    range,
                    signal,
                    getProject: getCurrentVideoEditorProjectSnapshot,
                    getCurrentTime: getCurrentVideoEditorCurrentTime,
                    place: appendMaterial,
                  })
                }
                onInsert={(assetId, range, signal) =>
                  placeMaterialWithTelemetry({
                    assetId,
                    range,
                    signal,
                    getProject: getCurrentVideoEditorProjectSnapshot,
                    getCurrentTime: getCurrentVideoEditorCurrentTime,
                    place: insertMaterial,
                  })
                }
                onOverlay={(assetId, range, signal) =>
                  placeMaterialWithTelemetry({
                    assetId,
                    range,
                    signal,
                    getProject: getCurrentVideoEditorProjectSnapshot,
                    getCurrentTime: getCurrentVideoEditorCurrentTime,
                    place: overlayMaterial,
                  })
                }
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

function WorkspaceLibraryPanel(
  props: VideoEditorWorkspaceCanvasProps & {
    children: React.ReactNode;
  }
) {
  const libraryNavigation = (
    <VideoEditorLibraryNavigation
      active={props.effectsLibraryDockOpen ? 'effects' : 'materials'}
      onChange={(active) =>
        active === 'effects'
          ? props.onEffectsLibraryDockOpenChange(true)
          : props.onMaterialsOpenChange(true)
      }
    />
  );
  const libraryActions = (
    <div className="flex shrink-0 items-center gap-1">
      <WorkspacePanelDockToggle
        fullHeight={props.materialsPanel.fullHeight}
        onToggle={props.materialsPanel.onToggle}
        dataUi="video-editor.materials.dock-toggle"
      />
      <WorkspacePanelCloseButton
        dataUi="video-editor.materials.close"
        title={translate('common.actions.close')}
        onClose={() => props.onMaterialsOpenChange(false)}
      />
    </div>
  );
  return (
    <>
      {(props.materialsOpen || props.effectsLibraryDockOpen) && (
        <div
          className="col-start-1 row-start-1 flex min-h-0 min-w-0"
          style={{ gridRowEnd: props.materialsPanel.fullHeight ? 4 : 2 }}
        >
          <div
            className="@container/library min-h-0 min-w-0"
            style={{ width: props.materialsPanel.resize.width }}
          >
            <FloatingChromePanel
              className="flex h-full min-h-0 flex-col overflow-hidden"
              dataUi="video-editor.library.panel"
            >
              <WorkspacePanelHeader actions={libraryActions}>
                {libraryNavigation}
              </WorkspacePanelHeader>
              <div className="min-h-0 flex-1">{props.children}</div>
            </FloatingChromePanel>
          </div>
          <WorkspacePanelResizeHandle
            resize={props.materialsPanel.resize}
            label={translate('videoEditor.app.resizeMaterials')}
            dataUi="video-editor.materials.resize"
          />
        </div>
      )}
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
    selectedActionOccurrence: preview.selection.selectedActionOccurrence,
    selectedClipId: preview.selection.selectedClipId,
    selectedMotionRegion: preview.selection.selectedMotionRegion,
    onClearActiveInsertKind: props.onClearActiveInsertKind,
    ...preview.editing,
    onImport: preview.onImport,
    ...createWorkspacePreviewActions(preview),
  };
}

function revealWorkspaceMaterial(
  use: ProjectAssetUse,
  preview: Pick<
    NonNullable<ReturnType<typeof useVideoEditorPreviewController>>,
    'project' | 'selection' | 'transport'
  >,
  onRevealClip: (clipId: string) => void
) {
  if (use.kind === 'scene') preview.selection.onSelectScene();
  if (use.kind !== 'clip') return;
  const clip = preview.project.clips.find((clip) => clip.id === use.clipId);
  if (!clip) return;
  preview.selection.onSelectClip(clip.id);
  preview.transport.onSeek(clip.startTime);
  onRevealClip(clip.id);
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

function VideoEditorWorkspaceTimeline(
  props: VideoEditorWorkspaceCanvasProps & {
    revealClipRequest: TimelineClipRevealRequest | undefined;
  }
): React.JSX.Element {
  const controller = useVideoEditorTimelineController();
  const presentation = useWorkspaceTrackPresentation();
  const onApplyEffectDocument = useVideoEditorEffectEditingPort((port) => port.applyEffectDocument);
  if (!controller || !presentation) return <div className="min-h-[220px] min-w-0 flex-1" />;
  return (
    <div className="min-h-[220px] min-w-0 flex-1">
      <ProjectTimeline
        revealClipRequest={props.revealClipRequest}
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
  source,
  onClose,
  sourceActive,
  onChange,
}: {
  source: VideoProjectAsset;
  onClose: () => void;
  sourceActive: boolean;
  onChange: (source: boolean) => void;
}) {
  return (
    <div className="flex h-9 min-w-0 items-center gap-2">
      {source ? (
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
      {sourceActive ? (
        <span
          className="min-w-0 truncate text-xs text-[var(--sniptale-color-text-muted)]"
          title={source.name}
        >
          {source.name}
          <span className="ml-2">
            {source.metadata.width && source.metadata.height
              ? `${source.metadata.width} × ${source.metadata.height}`
              : source.metadata.mimeType}
          </span>
        </span>
      ) : null}
      <WorkspacePanelCloseButton
        dataUi="video-editor.source.close"
        title={translate('videoEditor.app.closeSource')}
        onClose={onClose}
      />
    </div>
  );
}
