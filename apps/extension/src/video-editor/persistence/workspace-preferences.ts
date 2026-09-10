import { browserStorage } from '../../composition/persistence/infrastructure/browser-storage';

export interface WorkspacePreferences {
  effectLibraryFilters?: Partial<
    Record<'standalone' | 'targetEffect' | 'transition' | 'all', { query: string; theme: string }>
  >;
  inspectorPresentation: 'sections' | 'all';
  inspectorCollapsed: boolean;
  inspectorFullHeight: boolean;
  materialsFullHeight: boolean;
  activeLibrary: 'materials' | 'annotations' | 'effects' | 'transitions' | null;
  materialsWidth: number | null;
  inspectorWidth: number | null;
  previewHeight: number | null;
}

export const DEFAULT_WORKSPACE_PREFERENCES: WorkspacePreferences = {
  inspectorPresentation: 'sections',
  inspectorCollapsed: false,
  inspectorFullHeight: false,
  materialsFullHeight: false,
  activeLibrary: 'materials',
  materialsWidth: null,
  inspectorWidth: null,
  previewHeight: null,
};
const STORAGE_KEY = 'sniptale_video_editor_workspace_preferences';

/** Advisory workspace layout is separate from project content and history. */
export function parseWorkspacePreferences(value: unknown): WorkspacePreferences {
  const result = { ...DEFAULT_WORKSPACE_PREFERENCES };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  if ('inspectorPresentation' in value && value.inspectorPresentation === 'all')
    result.inspectorPresentation = 'all';
  for (const key of ['inspectorCollapsed', 'inspectorFullHeight', 'materialsFullHeight'] as const) {
    if (key in value && typeof Reflect.get(value, key) === 'boolean') {
      const flag: unknown = Reflect.get(value, key);
      if (typeof flag === 'boolean') result[key] = flag;
    }
  }
  if (
    'activeLibrary' in value &&
    (value.activeLibrary === null ||
      value.activeLibrary === 'materials' ||
      value.activeLibrary === 'effects' ||
      value.activeLibrary === 'annotations' ||
      value.activeLibrary === 'transitions')
  )
    result.activeLibrary = value.activeLibrary;
  for (const [key, min, max] of [
    ['materialsWidth', 200, 360],
    ['inspectorWidth', 280, 520],
    ['previewHeight', 220, 10000],
  ] as const) {
    const dimension: unknown = Reflect.get(value, key);
    if (
      typeof dimension === 'number' &&
      Number.isFinite(dimension) &&
      dimension >= min &&
      dimension <= max
    )
      result[key] = dimension;
  }
  if (
    'effectLibraryFilters' in value &&
    value.effectLibraryFilters &&
    typeof value.effectLibraryFilters === 'object'
  ) {
    const filters: NonNullable<WorkspacePreferences['effectLibraryFilters']> = {};
    for (const key of ['standalone', 'targetEffect', 'transition', 'all'] as const) {
      const filter: unknown = Reflect.get(value.effectLibraryFilters, key);
      if (!filter || typeof filter !== 'object' || !('query' in filter) || !('theme' in filter))
        continue;
      if (
        typeof filter.query === 'string' &&
        filter.query.length <= 256 &&
        typeof filter.theme === 'string' &&
        filter.theme.length <= 300
      )
        filters[key] = { query: filter.query, theme: filter.theme };
    }
    result.effectLibraryFilters = filters;
  }
  return result;
}

export async function loadWorkspacePreferences(): Promise<WorkspacePreferences> {
  const stored = await browserStorage.local.get([STORAGE_KEY]);
  return parseWorkspacePreferences(stored[STORAGE_KEY]);
}

export async function saveWorkspacePreferences(value: WorkspacePreferences): Promise<void> {
  await browserStorage.local.set({ [STORAGE_KEY]: value });
}
