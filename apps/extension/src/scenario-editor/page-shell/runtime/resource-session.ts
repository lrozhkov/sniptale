import { useCallback, useEffect, useRef } from 'react';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  acquireScenarioResourceSession,
  type ScenarioResourceSession,
} from '../../../composition/persistence/scenario/resource-sessions';
import { pruneScenarioResources } from '../../../composition/persistence/scenario/retention';

const logger = createLogger({ namespace: 'GuideResourceSession' });
type ActiveSession = { id: string; lease: ScenarioResourceSession };

async function releaseSession(session: ActiveSession | null) {
  if (!session) return;
  await session.lease.release();
  await pruneScenarioResources(session.id);
}

/** Holds protection before project reads and throughout this page's disposable undo lifetime. */
export function useGuideResourceSession() {
  const current = useRef<ActiveSession | null>(null);
  const generation = useRef(0);
  const enter = useCallback(async (id: string | null) => {
    const turn = ++generation.current;
    if (current.current?.id === id) return true;
    let next: ActiveSession | null = null;
    if (id) {
      await pruneScenarioResources(id);
      const lease = await acquireScenarioResourceSession(id);
      next = { id, lease };
    }
    if (turn !== generation.current) {
      await releaseSession(next);
      return false;
    }
    const previous = current.current;
    current.current = next;
    void releaseSession(previous).catch(() => logger.warn('Deferred guide resource cleanup'));
    return true;
  }, []);
  useEffect(
    () => () => {
      generation.current += 1;
      const previous = current.current;
      current.current = null;
      void releaseSession(previous).catch(() => logger.warn('Deferred guide resource cleanup'));
    },
    []
  );
  return enter;
}
