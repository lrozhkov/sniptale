import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createGlTransitionSelection,
  type GlTransitionSelection,
} from '../../features/video/project/transition/gl-catalog';
import { EFFECT_CATALOG_CHANGED_EVENT } from '../../features/video/project/effect-bundle/catalog/presets';
import {
  listGlPresetCatalogEntries,
  listBuiltinGlTransitionAvailability,
  resolveGlPresetCatalogEntry,
  type GlPresetCatalogEntry,
} from '../persistence/effect-bundles/gl-presets';
import { readVisualCatalogPreferences } from '../persistence/effect-bundles/preferences';

type Identity = {
  id: string;
  name: string;
  transitionName: string;
  enabled: boolean;
  builtin: boolean;
  entry?: GlPresetCatalogEntry;
};
export type GlCatalogItem = Identity &
  ({ status: 'ready'; selection: GlTransitionSelection } | { status: 'unsupported' });

/** Disposable presentation only. Sources, preferences and applied project values keep their owners. */
export async function readGlTransitionCatalog(): Promise<GlCatalogItem[]> {
  const [sources, builtin, preferences] = await Promise.all([
    listGlPresetCatalogEntries(),
    listBuiltinGlTransitionAvailability(),
    readVisualCatalogPreferences(),
  ]);
  const shipped: GlCatalogItem[] = builtin.map(({ transition, enabled }) => {
    const selection = createGlTransitionSelection(transition.name);
    if (!selection) throw new Error('Bundled GL transition is unavailable');
    return {
      id: `builtin:${transition.name}`,
      name: transition.name,
      transitionName: transition.name,
      enabled,
      builtin: true,
      status: 'ready',
      selection,
    };
  });
  return [
    ...sources.map((entry) => {
      const resolved = resolveGlPresetCatalogEntry(entry, preferences);
      const identity = {
        id: entry.id,
        entry,
        builtin: false,
        name: resolved.name,
        transitionName: resolved.transitionName,
        enabled: resolved.enabled,
      };
      return resolved.status === 'ready'
        ? { ...identity, status: 'ready' as const, selection: resolved.selection }
        : { ...identity, status: 'unsupported' as const };
    }),
    ...shipped,
  ];
}

/** Reject late reads after a new reload or disposal; a read failure grants no new apply choice. */
export function useGlTransitionCatalog() {
  const [items, setItems] = useState<GlCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const lifetime = useRef({ active: true, revision: 0 });
  const reload = useCallback(async () => {
    const owner = lifetime.current,
      revision = ++owner.revision;
    if (owner.active) setLoading(true);
    try {
      const next = await readGlTransitionCatalog();
      if (owner.active && owner.revision === revision) {
        setItems(next);
        setError(false);
      }
    } catch {
      if (owner.active && owner.revision === revision) setError(true);
    } finally {
      if (owner.active && owner.revision === revision) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const owner = { active: true, revision: 0 };
    lifetime.current = owner;
    void reload();
    window.addEventListener('focus', reload);
    window.addEventListener(EFFECT_CATALOG_CHANGED_EVENT, reload);
    return () => {
      owner.active = false;
      owner.revision++;
      window.removeEventListener('focus', reload);
      window.removeEventListener(EFFECT_CATALOG_CHANGED_EVENT, reload);
    };
  }, [reload]);
  return { items, loading, error, reload };
}
