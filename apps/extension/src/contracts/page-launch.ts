export const PAGE_CORNERS = ['top-left', 'top-right', 'bottom-right', 'bottom-left'] as const;
export type PageCorner = (typeof PAGE_CORNERS)[number];

export interface PageLaunchPreferences {
  enabled: boolean;
  hoverOnly: boolean;
  corner: PageCorner;
  quickActionsPopup: boolean;
  quickActionsCorner: boolean;
  quickActionsToolbar: boolean;
}

export const DEFAULT_PAGE_LAUNCH_PREFERENCES: Readonly<PageLaunchPreferences> = {
  enabled: false,
  hoverOnly: false,
  corner: 'bottom-right',
  quickActionsPopup: true,
  quickActionsCorner: false,
  quickActionsToolbar: false,
};

export function isPageCorner(value: unknown): value is PageCorner {
  return (
    value === 'top-left' ||
    value === 'top-right' ||
    value === 'bottom-left' ||
    value === 'bottom-right'
  );
}

export function parsePageLaunchPreferences(value: unknown): PageLaunchPreferences | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const result = { ...DEFAULT_PAGE_LAUNCH_PREFERENCES };
  for (const key of [
    'enabled',
    'hoverOnly',
    'quickActionsPopup',
    'quickActionsCorner',
    'quickActionsToolbar',
  ] as const) {
    const field: unknown = Object.getOwnPropertyDescriptor(value, key)?.value;
    if (field === undefined) continue;
    if (typeof field !== 'boolean') return null;
    result[key] = field;
  }
  const corner: unknown = Object.getOwnPropertyDescriptor(value, 'corner')?.value;
  if (corner !== undefined) {
    if (!isPageCorner(corner)) return null;
    result.corner = corner;
  }
  return result;
}

export function normalizePageLaunchPreferences(value: unknown): PageLaunchPreferences {
  return parsePageLaunchPreferences(value) ?? { ...DEFAULT_PAGE_LAUNCH_PREFERENCES };
}
