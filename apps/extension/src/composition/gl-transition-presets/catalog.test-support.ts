import {
  GL_TRANSITIONS,
  createGlTransitionSelection,
} from '../../features/video/project/transition/gl-catalog';
import type { GlCatalogItem } from './catalog';
export function createGlCatalogFixture() {
  const items: GlCatalogItem[] = GL_TRANSITIONS.map((entry) => {
    const selection = createGlTransitionSelection(entry.name);
    if (!selection) throw Error('Missing shipped transition');
    return {
      id: `builtin:${entry.name}`,
      name: entry.name,
      transitionName: entry.name,
      builtin: true,
      enabled: true,
      status: 'ready',
      selection,
    };
  });
  return { items, loading: false, error: false, reload: async () => undefined };
}

export function createImportedGlCatalogFixture() {
  const catalog = createGlCatalogFixture(),
    selection = createGlTransitionSelection('CrossZoom');
  if (!selection) throw Error('Missing CrossZoom');
  selection.values['strength'] = 0.73;
  catalog.items.unshift({
    id: 'gl.saved',
    name: 'Saved zoom',
    transitionName: 'CrossZoom',
    builtin: false,
    enabled: true,
    status: 'ready',
    selection,
  });
  return { catalog, selection };
}
