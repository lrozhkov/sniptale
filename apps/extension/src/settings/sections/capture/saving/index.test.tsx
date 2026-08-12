// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { savePresetsSectionContentSpy, storageDraftsSectionSpy, useSavePresetsSectionSpy } =
  vi.hoisted(() => ({
    savePresetsSectionContentSpy: vi.fn(),
    storageDraftsSectionSpy: vi.fn(),
    useSavePresetsSectionSpy: vi.fn(),
  }));

vi.mock('../storage-drafts', () => ({
  StorageDraftsSection: (props: unknown) => {
    storageDraftsSectionSpy(props);
    return <div data-testid="storage-drafts-section" />;
  },
}));

vi.mock('./surface/content', () => ({
  SavePresetsSectionContent: (props: unknown) => {
    savePresetsSectionContentSpy(props);
    return <div data-testid="save-presets-section-content" />;
  },
}));

vi.mock('./state/controller', () => ({
  useSavePresetsSection: () => useSavePresetsSectionSpy(),
}));

import { SavePresetsSection } from '.';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createSectionState() {
  return {
    handleMoveBefore: vi.fn(async () => undefined),
  };
}

function getContentProps() {
  return savePresetsSectionContentSpy.mock.calls[0]?.[0] as {
    onMoveBefore: (id: string, beforeId: string | null) => Promise<void>;
  };
}

async function renderSection(view?: string) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<SavePresetsSection {...(view === undefined ? {} : { view })} />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  savePresetsSectionContentSpy.mockReset();
  storageDraftsSectionSpy.mockReset();
  useSavePresetsSectionSpy.mockReset();
});

it('keeps storage management on its own subpage', async () => {
  useSavePresetsSectionSpy.mockReturnValue(createSectionState());

  await renderSection('storage');

  expect(savePresetsSectionContentSpy).not.toHaveBeenCalled();
  expect(storageDraftsSectionSpy).toHaveBeenCalledWith({ view: 'storage' });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('forwards the canonical insertion action through the save presets shell', async () => {
  const sectionState = createSectionState();
  useSavePresetsSectionSpy.mockReturnValue(sectionState);

  await renderSection();

  const props = getContentProps();
  await props.onMoveBefore('preset-1', null);

  expect(sectionState.handleMoveBefore).toHaveBeenCalledWith('preset-1', null);
});

it('forwards the editing preset only when the controller exposes it', async () => {
  useSavePresetsSectionSpy.mockReturnValue({
    ...createSectionState(),
    editingPreset: {
      enabled: true,
      id: 'preset-2',
      name: 'Images',
      order: 1,
      path: 'captures/images',
    },
  });

  await renderSection();

  expect(savePresetsSectionContentSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      editingPreset: expect.objectContaining({ id: 'preset-2' }),
    })
  );
});
