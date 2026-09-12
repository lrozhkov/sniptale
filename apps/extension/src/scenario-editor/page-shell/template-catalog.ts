import { useCallback, useEffect, useRef, useState } from 'react';
import { listScenarioStepTemplates } from '../../composition/persistence/scenario/store/public';
import { subscribeToMediaHubEvents } from '../../features/media-hub/events';

/** The editor owns a disposable catalog snapshot; the scenario store remains authoritative. */
export function useGuideTemplateCatalog() {
  const [entries, setEntries] = useState<Awaited<ReturnType<typeof listScenarioStepTemplates>>>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const lifetime = useRef({ active: false, revision: 0 });
  const reload = useCallback(async () => {
    const owner = lifetime.current;
    const revision = ++owner.revision;
    try {
      const next = await listScenarioStepTemplates();
      if (owner.active && owner.revision === revision) {
        setEntries(next);
        setStatus('ready');
      }
    } catch {
      if (owner.active && owner.revision === revision) setStatus('failed');
    }
  }, []);
  useEffect(() => {
    const owner = { active: true, revision: 0 };
    lifetime.current = owner;
    void reload();
    const unsubscribe = subscribeToMediaHubEvents((event) => {
      if (event.type === 'library-changed') void reload();
    });
    window.addEventListener('focus', reload);
    return () => {
      owner.active = false;
      unsubscribe();
      window.removeEventListener('focus', reload);
    };
  }, [reload]);
  return { entries, status, reload };
}
