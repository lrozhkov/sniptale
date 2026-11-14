import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { translate } from '../../../platform/i18n';
import { SourceImageFilterFields } from '../../../ui/source-image-filter-fields';
import { SelectField } from '../../../ui/compact-inspector-controls';
import { PreviewNumericRow } from '../../../ui/compact-inspector-controls/numeric-preview';
import { GlTransitionFields } from '../../../ui/gl-transition-fields';
import {
  glTransitionChoices,
  glTransitionChoiceValue,
  resolveGlTransitionChoice,
} from '../../../ui/gl-transition-choices';
import { useGlTransitionCatalog } from '../../../composition/gl-transition-presets/catalog';
import { GlTransitionPresetActions } from '../../../composition/gl-transition-presets/actions';
import type { TimelineEditingPort } from '../../contracts/controller-store';
import type {
  VideoProject,
  VideoProjectClip,
  VideoProjectTransition,
} from '../../../features/video/project/types';
import {
  useVideoEditorPreviewController,
  useVideoEditorSelectionsContext,
} from '../../runtime/controller/composition/hooks';
import {
  useVideoEditorClipSelectionPort,
  useVideoEditorEffectEditingPort,
  useVideoEditorTimelineEditingPort,
} from '../../runtime/controller/store';
import { VideoEditorEffectsLibraryDock } from '../../library/effects-dock';
import type { WorkspaceEffectBundlesState } from './effect-bundles';
import { buildProjectTransitionSegments } from '../../../features/video/project/transition/project';
import { VideoProjectClipType } from '../../../features/video/project/types';
import type { EffectLibraryOperations } from '../../library/effects-dock/operations';

export function VideoEditorWorkspaceEffectsLibrary(props: {
  effectBundles: WorkspaceEffectBundlesState;
  effectOperations: EffectLibraryOperations;
  isOpen: boolean;
  kind: 'standalone' | 'targetEffect' | 'transition';
}): React.JSX.Element | null {
  const preview = useVideoEditorPreviewController(props.isOpen);
  const selections = useVideoEditorSelectionsContext();
  const editorSelection = useVideoEditorClipSelectionPort((port) => port.selection);
  const onApplyEffect = useVideoEditorEffectEditingPort((port) => port.applyEffectDocument);
  const commands = useVideoEditorTimelineEditingPort((port) => ({
    editMediaClip: port.editMediaClip,
    updateTransitionDuration: port.updateTransitionDuration,
    updateTransitionEasing: port.updateTransitionEasing,
    updateTransitionTemplate: port.updateTransitionTemplate,
  }));
  if (!preview) return null;
  const selectedEffectTarget =
    editorSelection.kind === 'effect-instance'
      ? preview.project.effectInstances?.find(
          (instance) => instance.id === editorSelection.effectInstanceId
        )?.target
      : undefined;
  const selectedClip = preview.project.clips.find(
    ({ id }) =>
      id ===
      (selectedEffectTarget?.kind === 'clip'
        ? selectedEffectTarget.clipId
        : preview.selection.selectedClipId)
  );
  const selectedTransitionId = resolveEffectTransitionTargetId(
    preview.project,
    preview.transport.currentTime,
    selections.selectedTransition?.id ?? null
  );
  return (
    <VideoEditorEffectsLibraryDock
      effectTarget={selectedEffectTarget ?? null}
      catalogs={props.effectBundles.catalogs}
      kind={props.kind}
      currentTime={preview.transport.currentTime}
      appendTime={Math.max(
        0,
        ...preview.project.clips
          .filter((clip) =>
            selections.selectedTrack?.kind === 'PRIMARY' &&
            selections.selectedTrack.role !== 'CAMERA'
              ? clip.trackId === selections.selectedTrack.id
              : true
          )
          .map((clip) => clip.startTime + clip.duration)
      )}
      content={
        props.kind === 'targetEffect' ? (
          <NativeSourceFilterLibrary
            key={selectedClip?.id ?? 'empty'}
            project={preview.project}
            clip={selectedClip ?? null}
            disabled={props.effectOperations.disabled}
            commands={commands}
          />
        ) : props.kind === 'transition' ? (
          <NativeGlLibrary
            key={selectedTransitionId ?? 'empty'}
            project={preview.project}
            transition={
              preview.project.transitions?.find((entry) => entry.id === selectedTransitionId) ??
              null
            }
            disabled={props.effectOperations.disabled}
            commands={commands}
          />
        ) : undefined
      }
      showImport={props.kind === 'standalone'}
      errorCode={props.kind === 'standalone' ? props.effectBundles.errorCode : null}
      isLoading={props.kind === 'standalone' && props.effectBundles.isLoading}
      isOpen={props.isOpen}
      operations={props.effectOperations}
      onApplyEffect={onApplyEffect}
      onDeleteEffectBundle={props.effectBundles.onDeleteEffectBundle}
      onImportEffectFiles={props.effectBundles.onImportEffectFiles}
      onSetEffectBundleEnabled={props.effectBundles.onSetEffectBundleEnabled}
      selectedTrackId={
        selections.selectedTrack?.kind === 'PRIMARY' && selections.selectedTrack.role !== 'CAMERA'
          ? selections.selectedTrack.id
          : null
      }
      selectedClipId={
        selectedClip && selectedClip.type !== VideoProjectClipType.AUDIO ? selectedClip.id : null
      }
      selectedTransitionId={selectedTransitionId}
    />
  );
}

export function resolveEffectTransitionTargetId(
  project: NonNullable<ReturnType<typeof useVideoEditorPreviewController>>['project'],
  currentTime: number,
  selectedTransitionId: string | null
): string | null {
  const segments = buildProjectTransitionSegments(project);
  if (selectedTransitionId && segments.some(({ id }) => id === selectedTransitionId)) {
    return selectedTransitionId;
  }
  const active = segments.find(({ end, start }) => currentTime >= start && currentTime < end);
  if (active) return active.id;
  return segments.length === 1 ? segments[0]!.id : null;
}

type LibraryCommands = Pick<
  TimelineEditingPort,
  | 'editMediaClip'
  | 'updateTransitionDuration'
  | 'updateTransitionEasing'
  | 'updateTransitionTemplate'
>;

function NativeSourceFilterLibrary(props: {
  project: VideoProject;
  clip: VideoProjectClip | null;
  disabled: boolean;
  commands: LibraryCommands;
}) {
  const clip = props.clip;
  if (clip?.type !== VideoProjectClipType.VIDEO)
    return (
      <p role="status" className="p-3 text-xs text-[var(--sniptale-color-text-secondary)]">
        {translate('videoEditor.effectsLibrary.selectClipTarget')}
      </p>
    );
  const disabled =
    props.disabled ||
    props.project.tracks.find((track) => track.id === clip.trackId)?.locked !== false;
  return (
    <section
      data-ui="video-editor.effects-library.source-filters"
      className="min-h-0 flex-1 overflow-y-auto p-2"
    >
      <SourceImageFilterFields
        value={clip.sourceFilters}
        disabled={disabled}
        onChange={(stack) => {
          if (!disabled)
            props.commands.editMediaClip(clip.id, { kind: 'source-filters', stack: stack ?? null });
        }}
      />
    </section>
  );
}

function NativeGlLibrary(props: {
  project: VideoProject;
  transition: VideoProjectTransition | null;
  disabled: boolean;
  commands: LibraryCommands;
}) {
  const catalog = useGlTransitionCatalog();
  const transition = props.transition;
  if (transition?.kind !== 'gl')
    return (
      <p role="status" className="p-3 text-xs text-[var(--sniptale-color-text-secondary)]">
        {translate('videoEditor.effectsLibrary.selectTransitionTarget')}
      </p>
    );
  const clips = [transition.leadingClipId, transition.trailingClipId].map((id) =>
    props.project.clips.find((clip) => clip.id === id)
  );
  const disabled =
    props.disabled ||
    clips.some(
      (clip) =>
        !clip || props.project.tracks.find((track) => track.id === clip.trackId)?.locked !== false
    );
  const update = (selection: typeof transition.selection) => {
    if (!disabled)
      props.commands.updateTransitionTemplate(transition.id, { selection, presetId: null });
  };
  return (
    <section
      data-ui="video-editor.effects-library.gl"
      className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2"
    >
      {catalog.loading && (
        <p role="status" className="text-xs">
          {translate('videoEditor.effectsLibrary.catalogLoading')}
        </p>
      )}
      {catalog.error && (
        <div role="alert" className="space-y-1 text-xs">
          <p>{translate('videoEditor.effectsLibrary.catalogLoadFailed')}</p>
          <ContentToolbarButton
            onClick={() => {
              void catalog.reload();
            }}
          >
            {translate('common.actions.retry')}
          </ContentToolbarButton>
        </div>
      )}
      <PreviewNumericRow
        label={translate('videoEditor.sidebar.actionTimePrefix')}
        unit="s"
        value={transition.duration}
        min={1 / props.project.fps}
        max={Math.max(
          1 / props.project.fps,
          Math.min(5, ...clips.map((clip) => (clip?.duration ?? 1) - 1 / props.project.fps))
        )}
        step={1 / props.project.fps}
        disabled={disabled}
        onChange={(value) => {
          if (!disabled) props.commands.updateTransitionDuration(transition.id, value);
        }}
      />
      <SelectField
        label={translate('videoEditor.sidebar.inspectorGroupTransition')}
        value={glTransitionChoiceValue(catalog, transition.selection)}
        options={glTransitionChoices(catalog, transition.selection)}
        disabled={disabled || catalog.loading || catalog.error}
        onChange={(name) => {
          const selected = resolveGlTransitionChoice(catalog, name);
          if (selected) update(selected);
        }}
      />
      <GlTransitionFields
        selection={transition.selection}
        easing={transition.easing}
        disabled={disabled}
        onChangeSelection={update}
        onChangeEasing={(value) => {
          if (!disabled) props.commands.updateTransitionEasing(transition.id, value);
        }}
        presetActions={
          <GlTransitionPresetActions
            ownerKey={`${props.project.id}:${transition.id}`}
            ownerRevision={props.project}
            selection={transition.selection}
            disabled={disabled}
            onApply={update}
          />
        }
      />
    </section>
  );
}
