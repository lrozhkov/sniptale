import { useEffect, useRef } from 'react';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import { saveScenarioProjectRecord } from '../../../composition/persistence/scenario/store/public';

type SaveStatus = 'dirty' | 'saving' | 'saved' | 'failed' | 'conflict';
type AutosaveInput = {
  project: GuideProject | null;
  dirty: boolean;
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
  const request = useRef(save);
  request.current = save;
  useEffect(() => {
    if (!input.dirty || !input.project) return;
    const timer = window.setTimeout(() => void request.current(), 350);
    return () => window.clearTimeout(timer);
  }, [input.project, input.dirty]);
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      const state = latest.current;
      if (!state.project) return;
      if (state.project === state.saved.current && !state.autosaving.current) return;
      if (!state.protectUnsaved && !state.autosaving.current) return;
      event.preventDefault();
      event.returnValue = '';
      if (state.dirty) void request.current();
    };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, []);
  return { save };
}
