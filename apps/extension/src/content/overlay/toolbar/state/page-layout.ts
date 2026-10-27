import {
  PAGE_TOOLBAR_CONTROLS,
  isPageToolbarLayoutItem,
  PAGE_TOOLBAR_LAYOUT_MAX_ITEMS,
  PAGE_TOOLBAR_LAYOUT_MAX_DIVIDERS,
  PAGE_TOOLBAR_OVERRIDE_MODES,
  PAGE_TOOLBAR_LAYOUT_MODES,
  type ContentToolbarPreferences,
  type PageToolbarLayoutItem,
  type PageToolbarMode,
  type PageToolbarControl,
} from '../../../../contracts/settings';

const DEFAULT_HIDDEN_CONTROLS: readonly PageToolbarControl[] = [
  'after-capture',
  'capture-delay',
  'capture-size',
  'quick-actions',
  'scenario-panel',
  'auto-blur',
];

/** Default visibility is shared by fresh settings and the page-toolbar reset. */
export function createDefaultPageToolbarControls() {
  return Object.fromEntries(
    PAGE_TOOLBAR_CONTROLS.map((control) => [control, !DEFAULT_HIDDEN_CONTROLS.includes(control)])
  );
}

const CAPTURE: PageToolbarLayoutItem[] = [
  'separator:capture',
  'capture-visible',
  'capture-full',
  'capture-selection',
  'separator:options',
  'after-capture',
  'capture-delay',
  'capture-size',
  'quick-actions',
  'scenario-panel',
];
const HISTORY: PageToolbarLayoutItem[] = [
  'separator:history-before',
  'history-undo',
  'history-redo',
  'history-restore',
  'history-reset',
  'separator:history-after',
];
const MODE_ITEMS: Record<PageToolbarMode, PageToolbarLayoutItem[]> = {
  cursor: ['auto-blur'],
  drawing: [
    'drawing-select',
    'drawing-pencil',
    'drawing-marker',
    'drawing-text',
    'drawing-shape',
    'drawing-arrow',
    'drawing-blur',
  ],
  highlighter: [
    'annotation-effects',
    'annotation-callout',
    'annotation-step-badge',
    'separator:annotation',
    'auto-blur',
  ],
  'quick-edit': [
    'editing-block-selection',
    'editing-direct-text',
    'editing-ai',
    'editing-marker',
    'editing-ai-text',
  ],
  'design-review': [
    'review-comment',
    'review-inspect',
    'review-compare',
    'review-move',
    'review-check',
    'review-panel',
    'review-measurements',
    'review-layout-guides',
    'review-export',
  ],
};

/** Canonical page-mode order. Missing saved buttons join at their canonical neighbor. */
export function getPageToolbarLayout(
  mode: PageToolbarMode,
  saved?: readonly PageToolbarLayoutItem[] | null
): PageToolbarLayoutItem[] {
  const canonical: PageToolbarLayoutItem[] = [
    'mode',
    ...(mode === 'cursor' ? [] : (['separator:mode'] as const)),
    ...MODE_ITEMS[mode],
    ...CAPTURE,
    ...(mode === 'cursor'
      ? ([
          'separator:history-before',
          'history-restore',
          'history-reset',
          'separator:history-after',
          'pin-to-tab',
          'collapse',
        ] as const)
      : HISTORY),
    'settings',
  ];
  if (!saved) return canonical;
  const result = [...saved];
  for (let index = canonical.length - 1; index >= 0; index--) {
    const item = canonical[index]!;
    if (item.startsWith('separator:') || result.includes(item)) continue;
    const next = canonical.slice(index + 1).find((candidate) => result.includes(candidate));
    result.splice(next ? result.indexOf(next) : result.length, 0, item);
  }
  return result;
}

/** Reorders an admitted item relative to an admitted target, preserving all other identities. */
export function movePageToolbarItem(
  items: readonly PageToolbarLayoutItem[],
  source: PageToolbarLayoutItem,
  target: PageToolbarLayoutItem,
  before: boolean
): PageToolbarLayoutItem[] {
  if (source === target || !items.includes(source) || !items.includes(target)) return [...items];
  const result = items.filter((item) => item !== source);
  result.splice(result.indexOf(target) + (before ? 0 : 1), 0, source);
  return result;
}

/** Validates only the moved divider; accepted legacy neighbors elsewhere are preserved. */
export function isPageToolbarDividerPositionValid(
  items: readonly PageToolbarLayoutItem[],
  source: PageToolbarLayoutItem
): boolean {
  if (!source.startsWith('separator:')) return true;
  const index = items.indexOf(source);
  return (
    index >= 0 &&
    !items[index - 1]?.startsWith('separator:') &&
    !items[index + 1]?.startsWith('separator:')
  );
}

/** One settings patch restores every page mode without changing recording or shell placement. */
export function createPageToolbarResetPatch(): Pick<
  ContentToolbarPreferences,
  'pageControls' | 'pageControlOverrides' | 'pageLayouts'
> {
  return {
    pageControls: createDefaultPageToolbarControls(),
    pageControlOverrides: Object.fromEntries(
      PAGE_TOOLBAR_OVERRIDE_MODES.map((mode) => [
        mode,
        Object.fromEntries(PAGE_TOOLBAR_CONTROLS.map((control) => [control, null])),
      ])
    ),
    pageLayouts: Object.fromEntries(PAGE_TOOLBAR_LAYOUT_MODES.map((mode) => [mode, null])),
  };
}

/** Layout policy shares the existing settings writer; it owns no persistence or React state. */
export function createPageToolbarLayoutCommands(
  layout: PageToolbarLayoutItem[],
  mode: PageToolbarMode,
  save: (patch: ReturnType<typeof createPageToolbarResetPatch>) => Promise<void>
) {
  const saveLayout = (next: PageToolbarLayoutItem[]) => save({ pageLayouts: { [mode]: next } });
  const canAddSeparator =
    layout.length < PAGE_TOOLBAR_LAYOUT_MAX_ITEMS &&
    layout.filter((item) => item.startsWith('separator:')).length <
      PAGE_TOOLBAR_LAYOUT_MAX_DIVIDERS;
  return {
    canAddSeparator,
    moveItem: (source: PageToolbarLayoutItem, target: PageToolbarLayoutItem, before: boolean) => {
      const next = movePageToolbarItem(layout, source, target, before);
      return !isPageToolbarDividerPositionValid(next, source) ||
        next.every((item, index) => item === layout[index])
        ? Promise.resolve()
        : saveLayout(next);
    },
    addSeparator: (position?: {
      id: PageToolbarLayoutItem;
      target: PageToolbarLayoutItem;
      before: boolean;
    }) => {
      if (!canAddSeparator) return Promise.resolve();
      const id: PageToolbarLayoutItem = position?.id ?? `separator:${crypto.randomUUID()}`;
      if (!id.startsWith('separator:') || !isPageToolbarLayoutItem(id) || layout.includes(id))
        return Promise.resolve();
      let next: PageToolbarLayoutItem[];
      if (position) {
        if (!layout.includes(position.target)) return Promise.resolve();
        next = movePageToolbarItem([...layout, id], id, position.target, position.before);
      } else {
        next = [...layout];
        const insertion = next.findIndex(
          (item, index) =>
            index > 0 &&
            !item.startsWith('separator:') &&
            !next[index - 1]?.startsWith('separator:')
        );
        next.splice(insertion < 0 ? Math.max(0, next.indexOf('settings')) : insertion, 0, id);
      }
      return isPageToolbarDividerPositionValid(next, id) ? saveLayout(next) : Promise.resolve();
    },
    removeSeparator: (item: PageToolbarLayoutItem) =>
      item.startsWith('separator:')
        ? saveLayout(layout.filter((candidate) => candidate !== item))
        : Promise.resolve(),
    reset: () => save(createPageToolbarResetPatch()),
  };
}

/** Compares the same page customization fields that the canonical reset restores. */
export function hasPageToolbarCustomization(
  preferences: Pick<
    ContentToolbarPreferences,
    'pageControls' | 'pageControlOverrides' | 'pageLayouts'
  >
): boolean {
  const { pageControls = {}, pageControlOverrides = {}, pageLayouts = {} } = preferences;
  const defaults = createDefaultPageToolbarControls();
  return (
    PAGE_TOOLBAR_CONTROLS.some(
      (control) =>
        control !== 'drawing-pencil' &&
        typeof pageControls[control] === 'boolean' &&
        pageControls[control] !== defaults[control]
    ) ||
    PAGE_TOOLBAR_OVERRIDE_MODES.some((owner) =>
      PAGE_TOOLBAR_CONTROLS.some(
        (control) =>
          control !== 'drawing-pencil' &&
          typeof pageControlOverrides[owner]?.[control] === 'boolean'
      )
    ) ||
    PAGE_TOOLBAR_LAYOUT_MODES.some(
      (owner) =>
        pageLayouts[owner] != null &&
        JSON.stringify(getPageToolbarLayout(owner, pageLayouts[owner])) !==
          JSON.stringify(getPageToolbarLayout(owner))
    )
  );
}
