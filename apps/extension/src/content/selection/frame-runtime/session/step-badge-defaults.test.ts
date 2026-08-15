import { beforeEach, expect, it, vi } from 'vitest';
import type {
  StepBadgePresetCatalog,
  StepBadgeSettings,
} from '@sniptale/runtime-contracts/highlighter/step-badge';
import { createSystemStepBadgePresetCatalog } from '../../../../features/highlighter/step-badge-presets/catalog';

const mocks = vi.hoisted(() => ({
  catalog: null as StepBadgePresetCatalog | null,
  listener: null as ((catalog: StepBadgePresetCatalog) => void) | null,
  load: vi.fn<() => Promise<StepBadgePresetCatalog>>(),
}));

vi.mock('../../../../composition/persistence/step-badge-presets', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../composition/persistence/step-badge-presets')
  >()),
  getLoadedStepBadgePresetCatalogSnapshot: () => mocks.catalog,
  loadStepBadgePresetCatalog: mocks.load,
  subscribeToStepBadgePresetCatalog: (listener: (catalog: StepBadgePresetCatalog) => void) => {
    mocks.listener = listener;
    return () => undefined;
  },
}));

import {
  getAnnotationTemplateSources,
  resetAnnotationTemplateSources,
} from './annotation-template-source';
import { createStepBadgePresetSessionSync } from './step-badge-defaults';

function createCatalog(): StepBadgePresetCatalog {
  return {
    catalogCustomized: false,
    defaultPresetId: 'system-classic',
    newSessionDefaults: { enabled: true, templateSource: 'forced' },
    presets: createSystemStepBadgePresetCatalog(),
    systemCatalogRevision: 1,
  };
}

beforeEach(() => {
  resetAnnotationTemplateSources();
  mocks.catalog = createCatalog();
  mocks.listener = null;
  mocks.load.mockReset().mockResolvedValue(mocks.catalog);
});

it('initializes numbering state and source from the persisted new-session defaults', async () => {
  const ref: { current: StepBadgeSettings | null } = { current: null };
  createStepBadgePresetSessionSync(ref);
  await Promise.resolve();

  expect(ref.current).toMatchObject({ enabled: true, sourcePresetId: 'system-classic' });
  expect(getAnnotationTemplateSources().stepBadge).toBe('forced');

  mocks.listener?.({
    ...mocks.catalog!,
    newSessionDefaults: { enabled: false, templateSource: 'frame-default' },
  });
  expect(ref.current?.enabled).toBe(true);
  expect(getAnnotationTemplateSources().stepBadge).toBe('forced');
});

it('keeps legacy sessions disabled and frame-linked', async () => {
  const { newSessionDefaults: _defaults, ...legacy } = createCatalog();
  mocks.catalog = legacy;
  mocks.load.mockResolvedValue(mocks.catalog);
  const ref: { current: StepBadgeSettings | null } = { current: null };
  createStepBadgePresetSessionSync(ref);
  await Promise.resolve();

  expect(ref.current?.enabled).toBe(false);
  expect(getAnnotationTemplateSources().stepBadge).toBe('frame-default');
});

it('uses fresh storage defaults instead of a snapshot retained from the previous session', async () => {
  mocks.catalog = {
    ...createCatalog(),
    newSessionDefaults: { enabled: false, templateSource: 'frame-default' },
  };
  mocks.load.mockResolvedValue(createCatalog());
  const ref: { current: StepBadgeSettings | null } = { current: null };
  createStepBadgePresetSessionSync(ref);
  await Promise.resolve();

  expect(ref.current?.enabled).toBe(true);
  expect(getAnnotationTemplateSources().stepBadge).toBe('forced');
});
