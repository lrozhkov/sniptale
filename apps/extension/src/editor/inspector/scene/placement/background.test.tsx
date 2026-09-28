// @vitest-environment jsdom

import type React from 'react';
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../../../features/editor/document/constants';
import type { EditorFrameSettings } from '../../../../features/editor/document/types';
import { useInspectorSidebarDraftState } from '../../sidebar-controller/drafts';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) =>
    ({
      'editor.scene.backgroundTypeSection': 'Background type',
      'editor.compact.frameBackgroundModeColor': 'Color',
      'editor.compact.frameBackgroundModeGradient': 'Gradient',
      'editor.compact.frameBackgroundModeImage': 'Image',
    })[key] ?? key,
}));

import { EditorInspectorFrameBackgroundModeControl } from './background';

const FRAME: EditorFrameSettings = {
  ...DEFAULT_EDITOR_FRAME_SETTINGS,
  backgroundMode: 'color',
  backgroundColor: '#ffffff',
  backgroundImageData: null,
  backgroundImageFit: 'cover',
  layoutMode: 'fit-image',
};
const lastFillModeRef: { current: 'color' | 'gradient' } = { current: 'color' };

const SEGMENTED_SELECTOR = "[data-ui='shared.ui.compact-inspector.segmented-row']";

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderUi(element: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(element);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  lastFillModeRef.current = 'color';
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

function segmentedGroup() {
  return container?.querySelector(SEGMENTED_SELECTOR);
}

function segmentedButtons() {
  return Array.from(segmentedGroup()?.querySelectorAll('button') ?? []);
}

it('exposes color, gradient, and image as independent background modes', async () => {
  const setBackgroundMode = vi.fn();

  await renderUi(
    <EditorInspectorFrameBackgroundModeControl
      frameDraft={FRAME}
      lastFillModeRef={lastFillModeRef}
      setBackgroundMode={setBackgroundMode}
    />
  );

  expect(segmentedGroup()?.getAttribute('aria-label')).toBe('Background type');
  expect(segmentedButtons().map((button) => button.textContent)).toEqual([
    'Color',
    'Gradient',
    'Image',
  ]);
  expect(segmentedButtons()[0]?.getAttribute('aria-pressed')).toBe('true');
  expect(segmentedButtons()[1]?.getAttribute('aria-pressed')).toBe('false');

  await act(async () => {
    segmentedButtons()[2]?.click();
  });

  expect(setBackgroundMode).toHaveBeenCalledWith('image');

  lastFillModeRef.current = 'gradient';
  await renderUi(
    <EditorInspectorFrameBackgroundModeControl
      frameDraft={{ ...FRAME, backgroundMode: 'gradient' }}
      lastFillModeRef={lastFillModeRef}
      setBackgroundMode={setBackgroundMode}
    />
  );
  expect(segmentedButtons()[1]?.getAttribute('aria-pressed')).toBe('true');

  await renderUi(
    <EditorInspectorFrameBackgroundModeControl
      frameDraft={{ ...FRAME, backgroundMode: 'image' }}
      lastFillModeRef={lastFillModeRef}
      setBackgroundMode={setBackgroundMode}
    />
  );
  expect(segmentedButtons()[2]?.getAttribute('aria-pressed')).toBe('true');
  await act(async () => {
    segmentedButtons()[0]?.click();
  });
  expect(setBackgroundMode).toHaveBeenLastCalledWith('color');
});

it('remembers gradient after the compact background controls unmount and reopen', async () => {
  const gradientFrame = { ...FRAME, backgroundMode: 'gradient' as const };
  function Harness() {
    const [open, setOpen] = useState(true);
    const draft = useInspectorSidebarDraftState({
      canvasHeight: 400,
      canvasWidth: 800,
      frame: gradientFrame,
      inspector: 'frame',
      isResizableLayerSelection: false,
      selection: {
        hasSelection: false,
        selectedObjectCount: 0,
        selectedObjectHeight: null,
        selectedObjectId: null,
        selectedObjectIds: [],
        selectedObjectType: null,
        selectedObjectWidth: null,
      },
      sourceHeight: 400,
      sourceName: 'capture',
      sourceWidth: 800,
    });
    return (
      <>
        <button type="button" onClick={() => setOpen((current) => !current)}>
          toggle
        </button>
        <output>{draft.frameDraft.backgroundMode}</output>
        {open ? (
          <EditorInspectorFrameBackgroundModeControl
            frameDraft={draft.frameDraft}
            lastFillModeRef={draft.lastFillModeRef}
            setBackgroundMode={(backgroundMode) =>
              draft.setFrameDraft((state) => ({ ...state, backgroundMode }))
            }
          />
        ) : null}
      </>
    );
  }

  await renderUi(<Harness />);
  await act(async () => {
    segmentedButtons()[2]?.click();
  });
  expect(container?.querySelector('output')?.textContent).toBe('image');
  await act(async () => {
    (container?.querySelector('button') as HTMLButtonElement)?.click();
  });
  expect(segmentedGroup()).toBeNull();
  await act(async () => {
    (container?.querySelector('button') as HTMLButtonElement)?.click();
  });
  await act(async () => {
    segmentedButtons()[1]?.click();
  });
  expect(container?.querySelector('output')?.textContent).toBe('gradient');
});
