// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { savePresetsSectionContentSpy, useSavePresetsSectionSpy } = vi.hoisted(() => ({
  savePresetsSectionContentSpy: vi.fn(),
  useSavePresetsSectionSpy: vi.fn(),
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
    draggedId: 'preset-1',
    dragOverId: null,
    handleDrop: vi.fn(async () => undefined),
    setDraggedId: vi.fn(),
    setDragOverId: vi.fn(),
  };
}

function createDragEvent() {
  return {
    dataTransfer: {
      effectAllowed: 'copy',
    },
    preventDefault: vi.fn(),
  } as unknown as React.DragEvent<HTMLDivElement>;
}

function getContentProps() {
  return savePresetsSectionContentSpy.mock.calls[0]?.[0] as {
    onDragEnd: () => void;
    onDragLeave: () => void;
    onDragOver: (event: React.DragEvent<HTMLDivElement>, id: string) => void;
    onDragStart: (event: React.DragEvent<HTMLDivElement>, id: string) => void;
    onDrop: (event: React.DragEvent<HTMLDivElement>, id: string) => Promise<void>;
  };
}

async function renderSection() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<SavePresetsSection />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  savePresetsSectionContentSpy.mockReset();
  useSavePresetsSectionSpy.mockReset();
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

it('wires drag state handlers through the save presets shell', async () => {
  const sectionState = createSectionState();
  useSavePresetsSectionSpy.mockReturnValue(sectionState);

  await renderSection();

  const props = getContentProps();
  const startEvent = createDragEvent();
  const blockedDragOverEvent = createDragEvent();
  const activeDragOverEvent = createDragEvent();
  const dropEvent = createDragEvent();

  props.onDragStart(startEvent, 'preset-1');
  props.onDragOver(blockedDragOverEvent, 'preset-1');
  props.onDragOver(activeDragOverEvent, 'preset-2');
  await props.onDrop(dropEvent, 'preset-2');
  props.onDragLeave();
  props.onDragEnd();

  expect(sectionState.setDraggedId).toHaveBeenCalledWith('preset-1');
  expect(startEvent.dataTransfer.effectAllowed).toBe('move');
  expect(blockedDragOverEvent.preventDefault).toHaveBeenCalled();
  expect(activeDragOverEvent.preventDefault).toHaveBeenCalled();
  expect(sectionState.setDragOverId).toHaveBeenCalledWith('preset-2');
  expect(sectionState.handleDrop).toHaveBeenCalledWith('preset-2');
  expect(dropEvent.preventDefault).toHaveBeenCalled();
  expect(sectionState.setDragOverId).toHaveBeenCalledWith(null);
  expect(sectionState.setDraggedId).toHaveBeenCalledWith(null);
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
