import { beforeEach, expect, it, vi } from 'vitest';
import type {
  CalloutPresetCatalog,
  CalloutVisualStyle,
} from '@sniptale/runtime-contracts/highlighter/callout';
import { createSystemCalloutPresetCatalog } from '../../../../features/highlighter/callout-presets/catalog';

const mocks = vi.hoisted(() => ({
  catalog: null as CalloutPresetCatalog | null,
  listener: null as ((catalog: CalloutPresetCatalog) => void) | null,
  load: vi.fn<() => Promise<CalloutPresetCatalog>>(),
  unsubscribe: vi.fn(),
}));

vi.mock('../../../../composition/persistence/callout-presets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/callout-presets')>()),
  getLoadedCalloutPresetCatalogSnapshot: () => mocks.catalog,
  loadCalloutPresetCatalog: mocks.load,
  subscribeToCalloutPresetCatalog: (listener: (catalog: CalloutPresetCatalog) => void) => {
    mocks.listener = listener;
    return mocks.unsubscribe;
  },
}));

import { createCalloutPresetSessionSync, createSessionCalloutSettings } from './callout-defaults';
import {
  getAnnotationTemplateSources,
  resetAnnotationTemplateSources,
  setAnnotationTemplateSource,
} from './annotation-template-source';
import {
  getFutureFrameCallout,
  resetFutureFrameCallout,
  setFutureFrameCallout,
} from './future-callout';

function createCatalog(defaultPresetId = 'system-callout-bubble'): CalloutPresetCatalog {
  return {
    catalogCustomized: false,
    defaultPresetId,
    presets: createSystemCalloutPresetCatalog(),
    systemCatalogRevision: 1,
  };
}

beforeEach(() => {
  resetAnnotationTemplateSources();
  resetFutureFrameCallout();
  mocks.catalog = createCatalog();
  mocks.listener = null;
  mocks.load.mockReset().mockResolvedValue(mocks.catalog);
  mocks.unsubscribe.mockReset();
});

it('applies enabled and forced-template defaults once at the start of a session', async () => {
  mocks.catalog = {
    ...createCatalog(),
    newSessionDefaults: { enabled: true, templateSource: 'forced' },
  };
  mocks.load.mockResolvedValue(mocks.catalog);
  const ref: { current: CalloutVisualStyle | null } = { current: null };
  createCalloutPresetSessionSync(ref);
  await Promise.resolve();

  expect(getFutureFrameCallout()).toMatchObject({
    enabled: true,
    sourcePresetId: 'system-callout-bubble',
  });
  expect(getAnnotationTemplateSources().callout).toBe('forced');

  mocks.listener?.({
    ...mocks.catalog,
    newSessionDefaults: { enabled: false, templateSource: 'frame-default' },
  });
  expect(getFutureFrameCallout()).not.toBeNull();
  expect(getAnnotationTemplateSources().callout).toBe('forced');
});

it('uses fresh storage defaults instead of a snapshot retained from the previous session', async () => {
  mocks.catalog = {
    ...createCatalog(),
    newSessionDefaults: { enabled: false, templateSource: 'frame-default' },
  };
  mocks.load.mockResolvedValue({
    ...createCatalog(),
    newSessionDefaults: { enabled: true, templateSource: 'forced' },
  });
  createCalloutPresetSessionSync({ current: null });
  await Promise.resolve();

  expect(getFutureFrameCallout()?.enabled).toBe(true);
  expect(getAnnotationTemplateSources().callout).toBe('forced');
});

it('does not overwrite a session choice made before the catalog read completes', async () => {
  mocks.catalog = null;
  let resolveLoad: ((catalog: CalloutPresetCatalog) => void) | undefined;
  mocks.load.mockReturnValueOnce(new Promise((resolve) => (resolveLoad = resolve)));
  setFutureFrameCallout(null);
  setAnnotationTemplateSource('callout', 'frame-default');
  createCalloutPresetSessionSync({ current: null });
  resolveLoad?.({
    ...createCatalog(),
    newSessionDefaults: { enabled: true, templateSource: 'forced' },
  });
  await Promise.resolve();

  expect(getFutureFrameCallout()).toBeNull();
  expect(getAnnotationTemplateSources().callout).toBe('frame-default');
});

it('initializes and follows the catalog default while the session style is unchanged', async () => {
  const ref: { current: CalloutVisualStyle | null } = { current: null };
  const cleanup = createCalloutPresetSessionSync(ref);
  await Promise.resolve();
  expect(ref.current).toEqual(mocks.catalog!.presets[0]!.style);

  const next = createCatalog('system-callout-card');
  mocks.listener?.(next);
  expect(ref.current).toEqual(next.presets[1]!.style);

  cleanup();
  expect(mocks.unsubscribe).toHaveBeenCalledOnce();
});

it('does not overwrite a style customized after initialization', async () => {
  const ref: { current: CalloutVisualStyle | null } = { current: null };
  createCalloutPresetSessionSync(ref);
  await Promise.resolve();
  ref.current = {
    ...ref.current!,
    surface: { ...ref.current!.surface, radius: 31 },
  };

  mocks.listener?.(createCatalog('system-callout-card'));
  expect(ref.current?.surface.radius).toBe(31);
});

it('ignores a stale initial read after a subscription snapshot', async () => {
  let resolveLoad: ((catalog: CalloutPresetCatalog) => void) | undefined;
  mocks.load.mockReturnValueOnce(new Promise((resolve) => (resolveLoad = resolve)));
  const ref: { current: CalloutVisualStyle | null } = { current: null };
  createCalloutPresetSessionSync(ref);

  const subscribed = createCatalog('system-callout-card');
  mocks.listener?.(subscribed);
  resolveLoad?.(createCatalog('system-callout-bubble'));
  await Promise.resolve();

  expect(ref.current).toEqual(subscribed.presets[1]!.style);
});

it('marks a new callout with the matching default preset and applies its default position', () => {
  const preset = mocks.catalog!.presets[0]!;
  preset.content.titleText = 'Default template title';
  const settings = createSessionCalloutSettings(preset.style);
  expect(settings.sourcePresetId).toBe(preset.id);
  expect(settings.content).toEqual({ bodyHtml: '', titleText: 'Default template title' });
  expect(settings.placement).toEqual(preset.placement);
});
