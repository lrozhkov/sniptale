// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { editorContentPropsSpy, useEditorStateSpy } = vi.hoisted(() => ({
  editorContentPropsSpy: vi.fn(),
  useEditorStateSpy: vi.fn(),
}));

vi.mock('./content', () => ({
  BorderPresetEditorContent: (props: unknown) => {
    editorContentPropsSpy(props);
    return <div data-testid="border-preset-editor-content">content</div>;
  },
}));

vi.mock('./useBorderPresetEditorState', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./useBorderPresetEditorState')>()),
  useBorderPresetEditorState: (props: unknown) => useEditorStateSpy(props),
}));

import { BorderPresetEditor } from '.';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderEditor(props: React.ComponentProps<typeof BorderPresetEditor>) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<BorderPresetEditor {...props} />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  editorContentPropsSpy.mockReset();
  useEditorStateSpy.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe('BorderPresetEditor', () => {
  it('does not render modal content when the editor is closed', async () => {
    useEditorStateSpy.mockReturnValue({ derived: 'state' });

    await renderEditor({
      isOpen: false,
      onClose: vi.fn(),
      onSave: vi.fn(),
    });

    expect(useEditorStateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        isOpen: false,
      })
    );
    expect(editorContentPropsSpy).not.toHaveBeenCalled();
  });
});

describe('BorderPresetEditor opened state', () => {
  it('renders modal content with the derived editor state when opened', async () => {
    const onClose = vi.fn();
    const onSave = vi.fn();
    const preset = {
      id: 'preset-1',
      name: 'Preset',
      order: 0,
      tagIds: [],
      width: 3,
      color: '#ff6600',
      style: 'solid' as const,
      radius: 4,
      padding: { top: 1, right: 1, bottom: 1, left: 1 },
      shadow: 0,
      customCss: '',
      fillPaint: { kind: 'solid' as const, color: '#00000000' },
      inheritCustomCss: false,
    };
    const derivedState = { derived: 'state' };

    useEditorStateSpy.mockReturnValue(derivedState);

    await renderEditor({
      isOpen: true,
      onClose,
      onSave,
      preset,
    });

    expect(editorContentPropsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        isSaving: false,
        onClose,
        preset,
        state: derivedState,
        tagIds: [],
      })
    );
  });

  it('forwards the persistence busy state to the modal content', async () => {
    useEditorStateSpy.mockReturnValue({ derived: 'state' });

    await renderEditor({
      isOpen: true,
      isSaving: true,
      onClose: vi.fn(),
      onSave: vi.fn(),
    });

    expect(editorContentPropsSpy).toHaveBeenCalledWith(expect.objectContaining({ isSaving: true }));
  });
});
