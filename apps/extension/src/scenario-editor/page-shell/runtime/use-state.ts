import { useCallback, useEffect, useRef, useState } from 'react';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import {
  readScenarioEditorProjectId,
  readScenarioEditorStepId,
} from '@sniptale/runtime-contracts/scenario-editor/session';
import {
  createScenarioProjectRecord,
  duplicateScenarioProjectRecord,
  deleteScenarioProjectRecord,
  saveScenarioProjectRecord,
} from '../../../composition/persistence/scenario/store/public';
import { getScenarioProject } from '../../../composition/persistence/scenario/projects';
import { getScenarioAssetBlob } from '../../../composition/persistence/scenario/store/project-records/assets';
import { replaceScenarioEditorSelectionInUrl } from '../../platform/browser-driver';
import { useGuideHistory } from './history';

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

/** Owns this page's disposable edit buffer; persistence owns committed project ordering. */
export function useGuidePageState() {
  const [status, setStatus] = useState<GuidePageStatus>('loading');
  const [actionError, setActionError] = useState<'copy' | 'delete' | 'structure' | null>(null);
  const saved = useRef<GuideProject | null>(null);
  const busy = useRef(false);
  const { project, reset, commit, ...editing } = useGuideHistory({
    canEdit: () => !busy.current && status !== 'loading',
    onEdit: () => {
      setActionError(null);
      setStatus((current) => (current === 'conflict' ? 'conflict' : 'dirty'));
    },
    onFailure: () => setActionError('structure'),
  });
  const images = useGuideImages(project);
  const { selectedId, selectItem, clearSelection } = useGuideSelection(project);
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
      const loaded = await getScenarioProject(requestedId.current);
      if (turn !== generation.current) return;
      setActionError(null);
      saved.current = loaded ?? null;
      reset(loaded ?? null);
      setStatus(loaded ? 'ready' : 'missing');
    } catch {
      if (turn === generation.current) setStatus('unavailable');
    }
  }, [reset]);
  useEffect(() => {
    void load();
    return () => {
      generation.current += 1;
    };
  }, [load]);
  const mutate = async <T>(
    operation: () => Promise<T>,
    accept: (result: T) => void,
    reject: (error: unknown) => void
  ) => {
    if (busy.current) return;
    busy.current = true;
    const turn = generation.current;
    setActionError(null);
    setStatus('saving');
    try {
      const result = await operation();
      if (turn === generation.current) accept(result);
    } catch (error) {
      if (turn === generation.current) reject(error);
    } finally {
      busy.current = false;
    }
  };
  const acceptProject = (committed: GuideProject) => {
    saved.current = committed;
    commit(committed);
    setStatus('saved');
  };
  const openProject = (committed: GuideProject) => {
    requestedId.current = committed.id;
    acceptProject(committed);
    reset(committed);
    clearSelection();
    replaceScenarioEditorSelectionInUrl({ projectId: committed.id });
  };
  const create = (name: string) =>
    mutate(
      () => createScenarioProjectRecord(name),
      openProject,
      () => setStatus('failed')
    );
  const save = async () => {
    const base = saved.current;
    if (!project || !base || status === 'conflict') return;
    await mutate(
      () => saveScenarioProjectRecord(project, { baseUpdatedAt: base.updatedAt }),
      acceptProject,
      (error) =>
        setStatus(
          error instanceof Error && error.name === 'StaleScenarioAggregateRevisionError'
            ? 'conflict'
            : 'failed'
        )
    );
  };
  const rejectAction = (action: 'copy' | 'delete') => {
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
      () => {
        requestedId.current = null;
        saved.current = null;
        reset(null);
        clearSelection();
        replaceScenarioEditorSelectionInUrl({ projectId: null });
        setStatus('empty');
      },
      () => rejectAction('delete')
    );
  };
  return {
    project,
    status,
    actionError,
    images,
    selectedId,
    selectItem,
    create,
    ...editing,
    save,
    duplicate,
    remove,
    reload: load,
  };
}

/** Owns display URL acquisition and release independently from the editable project lifecycle. */
function useGuideImages(project: GuideProject | null) {
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
