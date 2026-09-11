import { useCallback, useEffect, useRef, useState } from 'react';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import {
  readScenarioEditorProjectId,
  readScenarioEditorStepId,
} from '@sniptale/runtime-contracts/scenario-editor/session';
import {
  createScenarioProjectRecord,
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
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    readScenarioEditorStepId(window.location.search)
  );
  const [images, setImages] = useState<Record<string, string | null>>({});
  const saved = useRef<GuideProject | null>(null);
  const busy = useRef(false);
  const generation = useRef(0);
  const requestedId = useRef(readScenarioEditorProjectId(window.location.search));
  const assetKey = JSON.stringify([
    ...new Set(
      project?.items.flatMap((item) =>
        item.kind === 'step'
          ? item.blocks.flatMap((block) => (block.kind === 'image' ? [block.assetId] : []))
          : []
      ) ?? []
    ),
  ]);
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
  const create = async (name: string) => {
    if (busy.current) return;
    busy.current = true;
    const turn = generation.current;
    setStatus('saving');
    try {
      const created = await createScenarioProjectRecord(name);
      if (turn !== generation.current) return;
      requestedId.current = created.id;
      saved.current = created;
      setProject(created);
      replaceScenarioEditorSelectionInUrl({ projectId: created.id });
      setStatus('saved');
    } catch {
      if (turn === generation.current) setStatus('failed');
    } finally {
      busy.current = false;
    }
  };
  const update = (next: GuideProject) => {
    if (busy.current || !project || next.id !== project.id) return;
    setProject(next);
    setStatus((current) => (current === 'conflict' ? 'conflict' : 'dirty'));
  };
  const save = async () => {
    if (busy.current || !project || !saved.current || status === 'conflict') return;
    busy.current = true;
    const turn = generation.current;
    setStatus('saving');
    try {
      const committed = await saveScenarioProjectRecord(project, {
        baseUpdatedAt: saved.current.updatedAt,
      });
      if (turn !== generation.current) return;
      saved.current = committed;
      setProject(committed);
      setStatus('saved');
    } catch (error) {
      if (turn === generation.current)
        setStatus(
          error instanceof Error && error.name === 'StaleScenarioAggregateRevisionError'
            ? 'conflict'
            : 'failed'
        );
    } finally {
      busy.current = false;
    }
  };
  const selectItem = (id: string) => {
    if (!project?.items.some((item) => item.id === id)) return;
    setSelectedId(id);
    replaceScenarioEditorSelectionInUrl({ projectId: project.id, stepId: id });
  };
  return { project, status, images, selectedId, selectItem, create, update, save, reload: load };
}
