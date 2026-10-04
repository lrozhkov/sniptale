import { useEffect, useRef } from 'react';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import { saveScenarioProjectRecord } from '../../../composition/persistence/scenario/store/public';

export const GUIDE_AUTOSAVE_IDLE_MS = 1500;
export const GUIDE_AUTOSAVE_MAX_WAIT_MS = 5000;

type SaveStatus = 'dirty' | 'saving' | 'saved' | 'failed' | 'conflict';
type AutosaveInput = {
  project: GuideProject | null;
  dirty: boolean;
  enabled?: boolean;
  conflict: boolean;
  protectUnsaved: boolean;
  saved: { current: GuideProject | null };
  busy: { current: boolean };
  autosaving: { current: boolean };
  generation: { current: number };
  onStatus: (status: SaveStatus) => void;
  onPublish: (project: GuideProject, source: GuideProject) => void;
};

/** Schedules writes through the page's shared admission gate and committed revision. */
export function useGuideAutosave(input: AutosaveInput) {
  const latest = useRef(input);
  latest.current = input;
  const pending = useRef<Promise<boolean> | null>(null);
  const dirtySince = useRef<number | null>(null);
  const acknowledged = useRef<{ source: GuideProject; committed: GuideProject } | null>(null);
  const save = () => {
    if (pending.current) return pending.current;
    const args = latest.current;
    const source = args.project;
    const base = args.saved.current;
    if (!source || !base || args.conflict || args.busy.current) return Promise.resolve(false);
    if (source === base) {
      args.onStatus('saved');
      return Promise.resolve(true);
    }
    args.busy.current = true;
    args.autosaving.current = true;
    args.onStatus('saving');
    const turn = args.generation.current;
    const operation = saveScenarioProjectRecord(source, { baseUpdatedAt: base.updatedAt })
      .then((committed) => {
        if (args.generation.current !== turn) return false;
        acknowledged.current = { source, committed };
        args.saved.current = committed;
        args.onPublish(committed, source);
        args.onStatus(latest.current.project === source ? 'saved' : 'dirty');
        return true;
      })
      .catch((error: unknown) => {
        if (args.generation.current === turn)
          args.onStatus(
            error instanceof Error && error.name === 'StaleScenarioAggregateRevisionError'
              ? 'conflict'
              : 'failed'
          );
        return false;
      })
      .finally(() => {
        args.busy.current = false;
        args.autosaving.current = false;
        pending.current = null;
      });
    pending.current = operation;
    return operation;
  };
  const flushLatest = async (): Promise<GuideProject | null> => {
    const generation = latest.current.generation.current;
    const projectId = latest.current.project?.id;
    while (latest.current.generation.current === generation) {
      if (pending.current) {
        if (!(await pending.current)) return null;
        continue;
      }
      const args = latest.current;
      const source = args.project;
      const base = args.saved.current;
      if (!source || !base || source.id !== projectId || args.conflict) return null;
      if (
        (source === acknowledged.current?.source && base === acknowledged.current.committed) ||
        guideDraftContent(source) === guideDraftContent(base)
      ) {
        args.onStatus('saved');
        return base;
      }
      if (!(await save())) return null;
    }
    return null;
  };
  const request = useRef(save);
  request.current = save;
  const flush = useRef(flushLatest);
  flush.current = flushLatest;
  useEffect(() => {
    if (!input.dirty || !input.project || input.enabled === false) {
      dirtySince.current = null;
      return;
    }
    dirtySince.current ??= Date.now();
    const remaining = Math.max(0, GUIDE_AUTOSAVE_MAX_WAIT_MS - (Date.now() - dirtySince.current));
    const timer = window.setTimeout(
      () => {
        dirtySince.current = null;
        void request.current();
      },
      Math.min(GUIDE_AUTOSAVE_IDLE_MS, remaining)
    );
    return () => window.clearTimeout(timer);
  }, [input.project, input.dirty, input.enabled]);
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      const state = latest.current;
      if (!state.project) return;
      if (state.project === state.saved.current && !state.autosaving.current) return;
      if (!state.protectUnsaved && !state.autosaving.current) return;
      event.preventDefault();
      event.returnValue = '';
      if (state.dirty && state.enabled !== false) void flush.current();
    };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, []);
  return {
    save,
    flushLatest,
    flushEdits: () => {
      if (latest.current.enabled !== false && latest.current.dirty) void flushLatest();
    },
  };
}

/** Persistence reorders object keys; only the aggregate timestamp is outside draft content. */
function guideDraftContent(project: GuideProject): string {
  return JSON.stringify({ ...project, updatedAt: 0 }, (_key, value: unknown) =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
        )
      : value
  );
}
