import { useCallback, useEffect, useRef, useState } from 'react';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import {
  readScenarioEditorProjectId,
  readScenarioEditorStepId,
} from '@sniptale/runtime-contracts/scenario-editor/session';
import {
  importScenarioImages,
  createScenarioProjectRecord,
  duplicateScenarioProjectRecord,
  deleteScenarioProjectRecord,
} from '../../../composition/persistence/scenario/store/public';
import { getScenarioProject } from '../../../composition/persistence/scenario/projects';
import { getScenarioAssetBlob } from '../../../composition/persistence/scenario/store/project-records/assets';
import { replaceScenarioEditorSelectionInUrl } from '../../platform/browser-driver';
import { useGuideHistory } from './history';
import { useGuideAutosave } from './autosave';
import { useGuideResourceSession } from './resource-session';
import { clearScenarioSavedHistory } from '../../../composition/persistence/scenario/retention';

import { restoreScenarioSavedVersion } from '../../../composition/persistence/scenario/history';
import { applyScenarioImageEdit } from '../../../workflows/scenario-capture-edit/edits';

type GuidePageStatus =
  | 'loading'
  | 'empty'
  | 'ready'
  | 'missing'
  | 'unavailable'
  | 'saving'
  | 'saved'
  | 'failed'
  | 'conflict'
  | 'dirty';

type GuideActionError =
  | 'copy'
  | 'delete'
  | 'structure'
  | 'import'
  | 'edit'
  | 'restore'
  | 'clearHistory';

type GuideCommitCommand =
  | { kind: 'clearHistory' }
  | { kind: 'restore'; revision: number }
  | {
      kind: 'import';
      input: Omit<Parameters<typeof importScenarioImages>[0], 'project' | 'baseUpdatedAt'>;
    }
  | {
      kind: 'edit';
      input: Omit<Parameters<typeof applyScenarioImageEdit>[0], 'project' | 'baseUpdatedAt'>;
    };

/** Owns this page's disposable edit buffer; persistence owns committed project ordering. */
export function useGuidePageState() {
  const enterResourceSession = useGuideResourceSession();
  const [status, setStatus] = useState<GuidePageStatus>('loading');
  const [actionError, setActionError] = useState<GuideActionError | null>(null);
  const saved = useRef<GuideProject | null>(null);
  const busy = useRef(false);
  const autosaving = useRef(false);
  const { project, reset, commit, publish, ...editing } = useGuideHistory({
    canEdit: () => (!busy.current || autosaving.current) && status !== 'loading',
    onEdit: () => {
      setActionError(null);
      setStatus((current) => (current === 'conflict' ? 'conflict' : 'dirty'));
    },
    onFailure: () => setActionError('structure'),
  });
  const { clearSelection, ...selection } = useGuideSelection(project);
  const generation = useRef(0);
  const requestedId = useRef(readScenarioEditorProjectId(window.location.search));
  const load = useCallback(async () => {
    const turn = ++generation.current;
    if (!requestedId.current) {
      setStatus('empty');
      return;
    }
    setStatus('loading');
    try {
      if (!(await enterResourceSession(requestedId.current))) return;
      const loaded = await getScenarioProject(requestedId.current);
      if (turn !== generation.current) return;
      setActionError(null);
      saved.current = loaded ?? null;
      reset(loaded ?? null);
      setStatus(loaded ? 'ready' : 'missing');
    } catch {
      if (turn === generation.current) setStatus('unavailable');
    }
  }, [reset, enterResourceSession]);
  useEffect(() => {
    void load();
    return () => {
      generation.current += 1;
    };
  }, [load]);
  const mutate = createGuideMutationRunner({ busy, generation, setStatus, setActionError });
  const acceptProject = (committed: GuideProject, reversible = false) => {
    saved.current = committed;
    commit(committed, reversible);
    setStatus('saved');
  };
  const openProject = async (committed: GuideProject | null) => {
    if (!(await enterResourceSession(committed?.id ?? null))) return;
    requestedId.current = committed?.id ?? null;
    saved.current = committed;
    reset(committed);
    setStatus(committed ? 'saved' : 'empty');
    clearSelection();
    replaceScenarioEditorSelectionInUrl({ projectId: committed?.id ?? null });
  };
  const create = (name: string) =>
    mutate(
      () => createScenarioProjectRecord(name),
      openProject,
      () => setStatus('failed')
    );
  const { save } = useGuideAutosave({
    project,
    dirty: status === 'dirty',
    conflict: status === 'conflict',
    protectUnsaved: status === 'dirty' || status === 'failed' || status === 'conflict',
    saved,
    busy,
    autosaving,
    generation,
    onStatus: setStatus,
    onPublish: publish,
  });
  const rejectAction = (action: Exclude<GuideActionError, 'structure'>) => {
    setStatus(status);
    setActionError(action);
  };
  const duplicate = async (name: string) => {
    if (!project) return;
    await mutate(
      () => duplicateScenarioProjectRecord(project, name),
      openProject,
      () => rejectAction('copy')
    );
  };
  const remove = async () => {
    if (!project) return;
    await mutate(
      () => deleteScenarioProjectRecord(project.id),
      () => openProject(null),
      () => rejectAction('delete')
    );
  };
  const commitChange = async (command: GuideCommitCommand) => {
    const base = saved.current;
    if (!project || !base || status === 'conflict') return false;
    if (command.kind === 'clearHistory' && status !== 'ready' && status !== 'saved') return false;
    return mutate(
      () => runGuideCommitCommand(command, project, base.updatedAt),
      (result) => acceptProject(result, command.kind !== 'clearHistory'),
      (error) => {
        if (isRevisionConflict(error)) setStatus('conflict');
        else if (error instanceof Error && error.name === 'AbortError') setStatus(status);
        else rejectAction(command.kind);
      }
    );
  };
  return {
    commitChange,
    editingLocked: status === 'loading' || (status === 'saving' && !autosaving.current),
    mutationPending: busy.current,
    project,
    status,
    actionError,
    images: useGuideImages(project),
    ...selection,
    create,
    ...editing,
    save,
    duplicate,
    remove,
    reload: load,
  };
}

/** Owns display URL acquisition and release independently from the editable project lifecycle. */
export function useGuideImages(project: GuideProject | null) {
  const [images, setImages] = useState<Record<string, string | null>>({});
  const assetKey = JSON.stringify([
    ...new Set(
      project?.items.flatMap((item) =>
        item.kind === 'step'
          ? item.blocks.flatMap((block) => (block.kind === 'image' ? [block.assetId] : []))
          : []
      ) ?? []
    ),
  ]);
  useEffect(() => {
    let active = true;
    const urls: string[] = [];
    setImages({});
    const parsedIds: unknown = JSON.parse(assetKey);
    const ids = Array.isArray(parsedIds)
      ? parsedIds.filter((id): id is string => typeof id === 'string')
      : [];
    void Promise.all(
      [...ids].map(async (id) => {
        const blob = await getScenarioAssetBlob(id).catch(() => undefined);
        if (!active) return;
        if (!blob) {
          setImages((current) => ({ ...current, [id]: null }));
          return;
        }
        const url = URL.createObjectURL(blob);
        urls.push(url);
        setImages((current) => ({ ...current, [id]: url }));
      })
    );
    return () => {
      active = false;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [assetKey]);
  return images;
}

/** Keeps item selection addressable when structural edits or undo remove the focused item. */
function useGuideSelection(project: GuideProject | null) {
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    readScenarioEditorStepId(window.location.search)
  );
  useEffect(() => {
    if (!project || !selectedId || project.items.some((item) => item.id === selectedId)) return;
    const fallback = project.items[0]?.id ?? null;
    setSelectedId(fallback);
    replaceScenarioEditorSelectionInUrl({ projectId: project.id, stepId: fallback });
  }, [project, selectedId]);
  const selectItem = (id: string | null, next = project) => {
    if (
      !project ||
      next?.id !== project.id ||
      (id !== null && !next.items.some((item) => item.id === id))
    )
      return;
    setSelectedId(id);
    replaceScenarioEditorSelectionInUrl({ projectId: project.id, stepId: id });
  };
  return { selectedId, selectItem, clearSelection: () => setSelectedId(null) };
}

function isRevisionConflict(error: unknown): boolean {
  return error instanceof Error && error.name === 'StaleScenarioAggregateRevisionError';
}

/** Dispatches the explicit image operation; page state retains revision and acceptance authority. */
function runGuideCommitCommand(
  command: GuideCommitCommand,
  project: GuideProject,
  baseUpdatedAt: number
) {
  if (command.kind === 'clearHistory') return clearScenarioSavedHistory(project.id, baseUpdatedAt);
  if (command.kind === 'restore')
    return restoreScenarioSavedVersion({
      projectId: project.id,
      revision: command.revision,
      baseUpdatedAt,
    });
  return command.kind === 'import'
    ? importScenarioImages({ ...command.input, project, baseUpdatedAt })
    : applyScenarioImageEdit({ ...command.input, project, baseUpdatedAt });
}

/** One command admission owner rejects duplicate and stale asynchronous page mutations. */
function createGuideMutationRunner({
  busy,
  generation,
  setStatus,
  setActionError,
}: {
  busy: { current: boolean };
  generation: { current: number };
  setStatus: (status: GuidePageStatus) => void;
  setActionError: (error: GuideActionError | null) => void;
}) {
  return async <T>(
    operation: () => Promise<T>,
    accept: (result: T) => void | Promise<void>,
    reject: (error: unknown) => void
  ) => {
    if (busy.current) return false;
    busy.current = true;
    const turn = generation.current;
    setActionError(null);
    setStatus('saving');
    try {
      const result = await operation();
      if (turn !== generation.current) return false;
      await accept(result);
      return true;
    } catch (error) {
      if (turn === generation.current) reject(error);
      return false;
    } finally {
      busy.current = false;
    }
  };
}
