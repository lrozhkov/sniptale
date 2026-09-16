import { useCallback, useEffect, useRef, useState } from 'react';
import {
  listScenarioStepTemplates,
  saveScenarioStepTemplate,
  deleteScenarioProjectRecord,
} from '../../../../composition/persistence/scenario/store/public';
import { createGuideProject, createGuideStep } from '../../../../features/scenario/project/public';
import { subscribeToMediaHubEvents } from '../../../../features/media-hub/events';
import { openScenarioEditorPage } from '../../../../platform/navigation/extension-pages';
import { translate } from '../../../../platform/i18n';

/** Settings owns catalog presentation; scenario aggregates own template changes and media. */
export function useScenarioLayoutsSettings() {
  const [entries, setEntries] = useState<Awaited<ReturnType<typeof listScenarioStepTemplates>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const lifetime = useRef({ active: true, revision: 0 });
  const reload = useCallback(async () => {
    const owner = lifetime.current;
    const revision = ++owner.revision;
    try {
      const next = await listScenarioStepTemplates();
      if (owner.active && owner.revision === revision) {
        setEntries(next);
        setLoading(false);
        setError(false);
      }
    } catch {
      if (owner.active && owner.revision === revision) {
        setLoading(false);
        setError(true);
      }
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
  const run = async (operation: () => Promise<unknown>) => {
    if (pending.current) return false;
    const owner = lifetime.current;
    pending.current = true;
    setBusy(true);
    setError(false);
    try {
      await operation();
      await reload();
      return true;
    } catch {
      if (owner.active) setError(true);
      return false;
    } finally {
      pending.current = false;
      if (owner.active) setBusy(false);
    }
  };
  return {
    entries,
    loading,
    error,
    busy,
    reload,
    create: () =>
      run(async () => {
        const source = createGuideProject(translate('scenario.editor.templateDefaultName'));
        const step = createGuideStep();
        source.items = [step];
        const saved = await saveScenarioStepTemplate(source, step.id, source.name);
        await openScenarioEditorPage(saved.id, saved.items[0]?.id);
      }),
    edit: (id: string) => run(() => openScenarioEditorPage(id)),
    remove: (id: string) => run(() => deleteScenarioProjectRecord(id)),
  };
}
