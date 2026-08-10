// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  calloutListener: null as null | ((value: { presets: Array<{ tagIds: string[] }> }) => void),
  create: vi.fn(),
  delete: vi.fn(),
  frameListener: null as null | ((value: { borderPresets: Array<{ tagIds: string[] }> }) => void),
  merge: vi.fn(),
  rename: vi.fn(),
  stepListener: null as null | ((value: { presets: Array<{ tagIds: string[] }> }) => void),
  toast: vi.fn(),
}));

vi.mock('../../../../../ui/annotation-template-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../ui/annotation-template-query')>()),
  useAnnotationTemplateTagState: () => ({
    error: false,
    isLoading: false,
    state: {
      schemaVersion: 1,
      activeFilterTagIds: [],
      tags: [
        { id: 'review', label: 'Review' },
        { id: 'training', label: 'Training' },
      ],
    },
  }),
}));
vi.mock(
  '../../../../../composition/persistence/annotation-template-tags',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../../composition/persistence/annotation-template-tags')
    >()),
    createAnnotationTemplateTag: mocks.create,
    deleteAnnotationTemplateTag: mocks.delete,
    mergeAnnotationTemplateTag: mocks.merge,
    renameAnnotationTemplateTag: mocks.rename,
  })
);
vi.mock('../../../../../composition/persistence/highlighter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../composition/persistence/highlighter')>()),
  loadHighlighterSettings: vi.fn(async () => ({ borderPresets: [{ tagIds: ['review'] }] })),
  subscribeToHighlighterSettings: (listener: typeof mocks.frameListener) => {
    mocks.frameListener = listener;
    return vi.fn();
  },
}));
vi.mock('../../../../../composition/persistence/step-badge-presets', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../../composition/persistence/step-badge-presets')
  >()),
  loadStepBadgePresetCatalog: vi.fn(async () => ({ presets: [{ tagIds: ['review'] }] })),
  subscribeToStepBadgePresetCatalog: (listener: typeof mocks.stepListener) => {
    mocks.stepListener = listener;
    return vi.fn();
  },
}));
vi.mock('../../../../../composition/persistence/callout-presets', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../../composition/persistence/callout-presets')
  >()),
  loadCalloutPresetCatalog: vi.fn(async () => ({ presets: [{ tagIds: ['training'] }] })),
  subscribeToCalloutPresetCatalog: (listener: typeof mocks.calloutListener) => {
    mocks.calloutListener = listener;
    return vi.fn();
  },
}));
vi.mock('@sniptale/ui/product-feedback/toast-service', () => ({
  toast: { error: mocks.toast },
}));
vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import { useAnnotationTemplateTagsController } from './controller';

let latest: ReturnType<typeof useAnnotationTemplateTagsController> | null = null;
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

function Harness() {
  latest = useAnnotationTemplateTagsController();
  return null;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  for (const mutation of [mocks.create, mocks.delete, mocks.merge, mocks.rename])
    mutation.mockReset().mockResolvedValue({ outcome: 'applied' });
  mocks.toast.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it('combines loaded and observed catalog usage without stale-load replacement', async () => {
  await act(async () => root.render(<Harness />));
  expect(latest?.usage.get('review')).toBe(2);
  expect(latest?.usage.get('training')).toBe(1);
  await act(async () => mocks.frameListener?.({ borderPresets: [{ tagIds: ['training'] }] }));
  expect(latest?.usage.get('review')).toBe(1);
  expect(latest?.usage.get('training')).toBe(2);
});

it('routes all mutations and reports rejected or thrown results without labels', async () => {
  await act(async () => root.render(<Harness />));
  await expect(latest?.actions.create('New')).resolves.toBe(true);
  await expect(latest?.actions.rename('review', 'Edited')).resolves.toBe(true);
  await expect(latest?.actions.merge('review', 'training')).resolves.toBe(true);
  await expect(latest?.actions.delete('review')).resolves.toBe(true);
  mocks.create.mockResolvedValueOnce({ outcome: 'rejected' }).mockRejectedValueOnce(new Error());
  await expect(latest?.actions.create('Secret label')).resolves.toBe(false);
  await expect(latest?.actions.create('Secret label')).resolves.toBe(false);
  expect(mocks.toast).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(mocks.toast.mock.calls)).not.toContain('Secret label');
});
