import {
  EDITOR_HISTORY_LIMITS,
  IMAGE_EDITOR_HISTORY_LIMITS,
} from '../../../../apps/extension/src/features/editor-history/policy';
import { seedEditableImageLifetime } from './editor-history-archive-probe';
import {
  commitImageWorkspace,
  readImageAggregateOriginalDocument,
} from '../../../../apps/extension/src/composition/persistence/image-aggregates';
import {
  readImageOriginalSource,
  readStoredImageWorkspace,
  readImageWorkspace,
} from '../../../../apps/extension/src/composition/persistence/image-workspaces/read';
import {
  createEditorSnapshotHistory,
  pushEditorSnapshotHistory,
  captureEditorHistoryCheckpoint,
} from '../../../../apps/extension/src/editor/controller/history';
import { createEmptyVideoProject } from '../../../../apps/extension/src/features/video/project/factories/creation';
import { createTextClip } from '../../../../apps/extension/src/features/video/project/factories/overlay-clip';
import {
  resetVideoEditorProjectHistory,
  recordVideoEditorProjectHistory,
  captureVideoEditorProjectHistory,
} from '../../../../apps/extension/src/video-editor/project/history';
import { createVideoProjectWorkspaceCommit } from '../../../../apps/extension/src/composition/persistence/projects/workspace-commit';
import { getVideoProjectWorkspace } from '../../../../apps/extension/src/composition/persistence/projects';
import {
  createGuideProject,
  createGuideStep,
} from '../../../../apps/extension/src/features/scenario/project/factories';
import { commitScenarioAggregateMutation } from '../../../../apps/extension/src/composition/persistence/scenario/aggregate-mutations';
import { getScenarioProjectEntry } from '../../../../apps/extension/src/composition/persistence/scenario/projects/project';
import { getRecording } from '../../../../apps/extension/src/composition/persistence/recordings';
import { inspectReviewVideo } from '../../../../apps/extension/src/workflows/video-review/source';
import {
  openVideoWorkspace,
  saveVideoWorkspaceSnapshot,
  readVideoWorkspace,
} from '../../../../apps/extension/src/composition/persistence/review-workspaces/store';
import {
  replayReviewHistory,
  reviewDocumentBaseline,
} from '../../../../apps/extension/src/features/video/review/document';

export type CapacityEditor = 'image' | 'montage' | 'scenario' | 'gallery';
const depth = 1000;

/** Seeds accepted history through native publishers; production capacity is never overridden. */
export async function seed(kind: CapacityEditor) {
  if (
    EDITOR_HISTORY_LIMITS.maxActions !== depth ||
    IMAGE_EDITOR_HISTORY_LIMITS.maxActions !== depth
  )
    throw new Error('The default editor capacity must be 1000.');
  if (kind === 'image') {
    const { id } = await seedEditableImageLifetime();
    const original = await readImageAggregateOriginalDocument(id);
    const previous = await readStoredImageWorkspace(id);
    const observed = await readImageOriginalSource(id, { includeBlob: false });
    if (!original || !previous) throw new Error('Missing native Image predecessor.');
    const history = createEditorSnapshotHistory({ ...original, displayName: 'Capacity image 0' });
    let document = original;
    for (let index = 1; index <= depth; index++) {
      document = { ...original, displayName: `Capacity image ${index}` };
      pushEditorSnapshotHistory({ history, muted: false, exportDocument: () => document });
    }
    const checkpoint = captureEditorHistoryCheckpoint(history);
    if (!checkpoint || checkpoint.cursor !== depth)
      throw new Error('Image capacity was truncated.');
    await commitImageWorkspace({
      aggregateId: id,
      document,
      history: checkpoint,
      expectedRevision: previous.revision,
      expectedGeneration: observed.sourceGeneration ?? null,
      requireExistingRoot: true,
      imageContentState: 'edited',
    });
    return { kind, id };
  }
  if (kind === 'montage') {
    let project = createEmptyVideoProject('Capacity montage 0');
    project.id = 'capacity-montage';
    project.duration = 12;
    project.clips = [
      { ...createTextClip(project.tracks[0]!.id, project.width, project.height, 0), duration: 12 },
    ];
    let history = resetVideoEditorProjectHistory(project.id);
    for (let index = 1; index <= depth; index++) {
      const next = { ...project, name: `Capacity montage ${index}` };
      history = recordVideoEditorProjectHistory(history, project, next);
      project = next;
    }
    const captured = captureVideoEditorProjectHistory(history, project);
    if (!captured || captured.past.length !== depth)
      throw new Error('Montage capacity was truncated.');
    await createVideoProjectWorkspaceCommit({
      project,
      history: captured,
      expectedProject: null,
      expectedWorkspaceRevision: null,
    })();
    return { kind, id: project.id };
  }
  if (kind === 'scenario') {
    const project = createGuideProject('Capacity scenario 1000', 'capacity-scenario', 1);
    project.items = [createGuideStep('Retained step', 'capacity-step')];
    await commitScenarioAggregateMutation(project, {
      expectedRevision: null,
      editingHistory: {
        version: 1,
        past: Array.from({ length: depth }, (_, index) => ({
          ...project,
          name: `Capacity scenario ${index}`,
        })),
        future: [],
      },
    });
    return { kind, id: project.id };
  }
  const id = 'recording:beta-v1-recording';
  const recording = await getRecording('beta-v1-recording');
  if (!recording) throw new Error('Missing actual Gallery recording.');
  const metadata = await inspectReviewVideo(recording.file, new AbortController().signal);
  const current = await openVideoWorkspace(id, metadata.source);
  let volume = 1;
  const history = Array.from({ length: depth }, (_, index) => {
    const before = { muted: false, volume };
    volume = index % 2 === 0 ? 0.5 : 0.4;
    return {
      id: `capacity-${index}`,
      at: Date.now(),
      target: 'sourceAudio' as const,
      before,
      after: { muted: false, volume },
    };
  });
  await saveVideoWorkspaceSnapshot({
    aggregateId: id,
    expectedRevision: current.workspace.revision,
    expectedDraftRevision: current.draft?.revision ?? null,
    expectedSourceAssetId: current.workspace.sourceAssetId,
    workspace: {
      ...current.workspace,
      advanced: {
        ...current.workspace.advanced,
        ui: { ...current.workspace.advanced.ui, mode: 'advanced' },
      },
      history,
      cursor: depth,
    },
    draft: null,
  });
  return { kind, id };
}

/** Reads the same native graphs that editor opening consumes. */
export async function inspect(kind: CapacityEditor, id: string) {
  if (kind === 'image') {
    const value = await readImageWorkspace(id);
    if (!value?.history) throw new Error('Missing native Image history.');
    return {
      revision: value.revision,
      count: value.history.snapshots.length - 1,
      cursor: value.history.cursor,
      name: value.document.displayName,
      future: value.history.snapshots.length - value.history.cursor - 1,
    };
  }
  if (kind === 'montage') {
    const value = await getVideoProjectWorkspace(id);
    if (value.status !== 'ready' || value.history.status !== 'ready')
      throw new Error('Missing native Montage history.');
    return {
      revision: value.workspaceRevision,
      count: value.history.value.past.length + value.history.value.future.length,
      cursor: value.history.value.past.length,
      name: value.project.name,
      future: value.history.value.future.length,
    };
  }
  if (kind === 'scenario') {
    const value = await getScenarioProjectEntry(id);
    if (!value?.editingHistory) throw new Error('Missing native Scenario history.');
    return {
      revision: value.workspaceRevision,
      count: value.editingHistory.past.length + value.editingHistory.future.length,
      cursor: value.editingHistory.past.length,
      name: value.project.name,
      future: value.editingHistory.future.length,
    };
  }
  const value = await readVideoWorkspace(id);
  if (!value) throw new Error('Missing native Gallery history.');
  const document = replayReviewHistory(
    value.workspace.history,
    value.workspace.cursor,
    value.workspace.source,
    reviewDocumentBaseline(value.workspace)
  );
  return {
    revision: value.workspace.revision,
    count: value.workspace.history.length,
    cursor: value.workspace.cursor,
    volume: document.advancedContent.audio.original.volume,
    future: value.workspace.history.length - value.workspace.cursor,
  };
}
