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
  const [project, setProject] = useState<GuideProject | null>(null);
  const [status, setStatus] = useState<GuidePageStatus>('loading');
  const [actionError, setActionError] = useState<'copy' | 'delete' | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    readScenarioEditorStepId(window.location.search)
  );
  const images = useGuideImages(project);
  const saved = useRef<GuideProject | null>(null);
  const busy = useRef(false);
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
      setProject(loaded ?? null);
      setStatus(loaded ? 'ready' : 'missing');
    } catch {
      if (turn === generation.current) setStatus('unavailable');
    }
  }, []);
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
    setProject(committed);
    setStatus('saved');
  };
  const openProject = (committed: GuideProject) => {
    requestedId.current = committed.id;
    acceptProject(committed);
    setSelectedId(null);
    replaceScenarioEditorSelectionInUrl({ projectId: committed.id });
  };
  const create = (name: string) =>
    mutate(
      () => createScenarioProjectRecord(name),
      openProject,
      () => setStatus('failed')
    );
  const update = (next: GuideProject) => {
    if (busy.current || !project || next.id !== project.id) return;
    setProject(next);
    setStatus((current) => (current === 'conflict' ? 'conflict' : 'dirty'));
  };
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
        setProject(null);
        setSelectedId(null);
        replaceScenarioEditorSelectionInUrl({ projectId: null });
        setStatus('empty');
      },
      () => rejectAction('delete')
    );
  };
  const selectItem = (id: string) => {
    if (!project?.items.some((item) => item.id === id)) return;
    setSelectedId(id);
    replaceScenarioEditorSelectionInUrl({ projectId: project.id, stepId: id });
  };
  return {
    project,
    status,
    actionError,
    images,
    selectedId,
    selectItem,
    create,
    update,
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
