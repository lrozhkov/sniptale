// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScenarioCaptureStep } from '../../../features/scenario/contracts/types/project';
import { QuickEditOverlayList } from './sidebar.overlays';

vi.mock('./ScenarioQuickEditOverlayEditor', () => ({
  ScenarioQuickEditOverlayEditor: (props: {
    overlay: ScenarioCaptureStep['overlays'][number];
    onChange: (overlay: ScenarioCaptureStep['overlays'][number]) => void;
  }) => (
    <button
      type="button"
      data-testid="mock-overlay-editor"
      onClick={() => props.onChange({ ...props.overlay, point: { x: 90, y: 91 } } as never)}
    >
      edit
    </button>
  ),
  getOverlayKindLabel: (kind: string) => `label:${kind}`,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createOverlays(): ScenarioCaptureStep['overlays'] {
  return [
    { id: 'click-1', kind: 'click-ring', point: { x: 10, y: 20 } },
    {
      id: 'text-1',
      kind: 'text',
      point: { x: 30, y: 40 },
      text: 'Hello',
      color: '#111111',
      fontSize: 16,
      fontFamily: 'Inter',
      fontWeight: 400,
    },
  ];
}

async function renderOverlayList(props: Parameters<typeof QuickEditOverlayList>[0]) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<QuickEditOverlayList {...props} />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function runOverlaySelectionTest() {
  it('selects overlays through list rows', async () => {
    const onSelectOverlay = vi.fn();
    await renderOverlayList({
      overlays: createOverlays(),
      selectedOverlayId: null,
      onOverlayChange: vi.fn(),
      onOverlayRemove: vi.fn(),
      onSelectOverlay,
    });

    const buttons = Array.from(container?.querySelectorAll('button') ?? []);
    expect(buttons[0]?.textContent).toContain('label:click-ring');

    await act(async () => {
      buttons[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSelectOverlay).toHaveBeenCalledWith('click-1');
  });
}

function runOverlayEditAndRemoveTest() {
  it('routes overlay edit and removal through sidebar callbacks', async () => {
    const overlays = createOverlays();
    const onOverlayChange = vi.fn();
    const onOverlayRemove = vi.fn();
    await renderOverlayList({
      overlays,
      selectedOverlayId: 'click-1',
      onOverlayChange,
      onOverlayRemove,
      onSelectOverlay: vi.fn(),
    });

    const editButton = container?.querySelector('[data-testid="mock-overlay-editor"]');
    expect(editButton).not.toBeNull();

    await act(async () => {
      editButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onOverlayChange).toHaveBeenCalledWith(
      'click-1',
      expect.arrayContaining([
        expect.objectContaining({
          id: 'click-1',
          point: expect.objectContaining({ x: 90, y: 91 }),
        }),
      ])
    );

    const buttons = Array.from(container?.querySelectorAll('button') ?? []);
    const remove = buttons[buttons.length - 1];
    await act(async () => {
      remove?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onOverlayRemove).toHaveBeenCalledWith('click-1');
  });
}

function runQuickEditOverlayListSuite() {
  runOverlaySelectionTest();
  runOverlayEditAndRemoveTest();
}

describe('scenario quick-edit sidebar overlays', runQuickEditOverlayListSuite);
