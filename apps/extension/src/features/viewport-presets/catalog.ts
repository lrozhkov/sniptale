import {
  VIEWPORT_PRESET_CATALOG_REVISION,
  type SystemViewportPreset,
  type SystemViewportPresetKey,
  type ViewportPreset,
  type ViewportPresetTarget,
} from './contracts';

interface CatalogEntry {
  id: string;
  systemKey: SystemViewportPresetKey;
  target: ViewportPresetTarget;
  width: number;
  height: number;
}

const entries: readonly CatalogEntry[] = [
  {
    id: 'system:viewport-mobile-portrait',
    systemKey: 'viewportMobilePortrait',
    target: 'viewport',
    width: 390,
    height: 844,
  },
  {
    id: 'system:viewport-mobile-landscape',
    systemKey: 'viewportMobileLandscape',
    target: 'viewport',
    width: 844,
    height: 390,
  },
  {
    id: 'system:viewport-tablet-portrait',
    systemKey: 'viewportTabletPortrait',
    target: 'viewport',
    width: 768,
    height: 1024,
  },
  {
    id: 'system:viewport-tablet-landscape',
    systemKey: 'viewportTabletLandscape',
    target: 'viewport',
    width: 1024,
    height: 768,
  },
  {
    id: 'system:viewport-hd',
    systemKey: 'viewportHd',
    target: 'viewport',
    width: 1280,
    height: 720,
  },
  {
    id: 'system:viewport-full-hd',
    systemKey: 'viewportFullHd',
    target: 'viewport',
    width: 1920,
    height: 1080,
  },
  {
    id: 'system:window-hd',
    systemKey: 'windowHd',
    target: 'window',
    width: 1280,
    height: 720,
  },
  {
    id: 'system:window-laptop',
    systemKey: 'windowLaptop',
    target: 'window',
    width: 1366,
    height: 768,
  },
  {
    id: 'system:window-desktop',
    systemKey: 'windowDesktop',
    target: 'window',
    width: 1440,
    height: 900,
  },
  {
    id: 'system:window-full-hd',
    systemKey: 'windowFullHd',
    target: 'window',
    width: 1920,
    height: 1080,
  },
];

const orderByTarget: Record<ViewportPresetTarget, number> = { viewport: 0, window: 0 };
const canonicalCatalog: readonly SystemViewportPreset[] = entries.map((entry) => ({
  kind: 'system',
  catalogRevision: VIEWPORT_PRESET_CATALOG_REVISION,
  customized: false,
  enabled: true,
  order: orderByTarget[entry.target]++,
  ...entry,
}));

export function cloneViewportPreset<TPreset extends ViewportPreset>(preset: TPreset): TPreset {
  return { ...preset };
}

export function createSystemViewportPresetCatalog(): ViewportPreset[] {
  return canonicalCatalog.map(cloneViewportPreset);
}

export function getCanonicalSystemViewportPreset(
  key: SystemViewportPresetKey
): SystemViewportPreset {
  const preset = canonicalCatalog.find((item) => item.systemKey === key);
  if (!preset) {
    throw new Error(`Unknown system viewport preset: ${key}`);
  }
  return cloneViewportPreset(preset);
}

export function getSystemViewportPresetKeys(): readonly SystemViewportPresetKey[] {
  return entries.map((entry) => entry.systemKey);
}
