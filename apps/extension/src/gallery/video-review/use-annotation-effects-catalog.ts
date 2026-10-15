import { useCallback, useEffect, useRef, useState } from 'react';
import { listEffectBundles } from '../../composition/persistence/effect-bundles';
import type { EffectBundleCatalogListItem } from '../../features/video/project/effect-bundle/catalog';
import { EFFECT_CATALOG_CHANGED_EVENT } from '../../features/video/project/effect-bundle/catalog/presets';

/** Read-only picker subscription; prepared and applied sources retain their session owner. */
export function useReviewAnnotationCatalog(active: boolean, read = listEffectBundles) {
  const [items, setItems] = useState<EffectBundleCatalogListItem[]>([]);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'failed'>('loading');
  const generation = useRef(0);
  const reload = useCallback(async () => {
    if (!active) return;
    const request = ++generation.current;
    setPhase('loading');
    try {
      const loaded = await read();
      if (request !== generation.current) return;
      setItems(loaded);
      setPhase('ready');
    } catch {
      if (request === generation.current) setPhase('failed');
    }
  }, [active, read]);
  useEffect(() => {
    const counter = generation;
    setItems([]);
    setPhase('loading');
    if (!active) return;
    const refresh = () => {
      void reload();
    };
    refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener(EFFECT_CATALOG_CHANGED_EVENT, refresh);
    return () => {
      ++counter.current;
      window.removeEventListener('focus', refresh);
      window.removeEventListener(EFFECT_CATALOG_CHANGED_EVENT, refresh);
    };
  }, [active, reload]);
  return { items: phase === 'ready' ? items : [], phase, reload };
}
