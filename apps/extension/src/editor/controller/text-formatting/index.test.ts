import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isTextboxMock: vi.fn((object: { kind?: string }) => object.kind === 'textbox'),
}));

vi.mock('../core/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../core/helpers')>()),
  isTextbox: mocks.isTextboxMock,
}));

import { applyEditorTextSelectionStyle, getTextSettingsStylePatch } from './';

function createFormattingOptions(activeObject: unknown) {
  return {
    canvas: {
      getActiveObject: () => activeObject,
      requestRenderAll: vi.fn(),
    },
    commitHistory: vi.fn(),
    syncRuntimeState: vi.fn(),
    withHistoryMuted: vi.fn((callback: () => void) => callback()),
  };
}

function registerInlineStyleApplicationTests() {
  it('applies inline styles to the active textbox selection', () => {
    const textbox = {
      getSelectionStyles: vi.fn(() => [{ fontWeight: 'normal' }, { fontWeight: 'normal' }]),
      kind: 'textbox',
      sniptaleType: 'text',
      selectionEnd: 5,
      selectionStart: 1,
      setSelectionStyles: vi.fn(),
    };
    const options = createFormattingOptions(textbox);

    const applied = applyEditorTextSelectionStyle(options as never, 'bold');

    expect(applied).toBe(true);
    expect(textbox.setSelectionStyles).toHaveBeenCalledWith({ fontWeight: 'bold' }, 1, 5);
    expect(options.canvas.requestRenderAll).toHaveBeenCalledOnce();
    expect(options.commitHistory).toHaveBeenCalledOnce();
    expect(options.syncRuntimeState).toHaveBeenCalledOnce();
  });

  it('toggles the whole active textbox when it is selected outside editing mode', () => {
    const textbox = {
      dirty: false,
      fontWeight: 'normal',
      kind: 'textbox',
      sniptaleType: 'text',
      selectionEnd: 0,
      selectionStart: 0,
      set: vi.fn(),
    };
    const options = createFormattingOptions(textbox);

    const applied = applyEditorTextSelectionStyle(options as never, 'bold');

    expect(applied).toBe(true);
    expect(textbox.set).toHaveBeenCalledWith({ fontWeight: 'bold' });
    expect(textbox.dirty).toBe(true);
    expect(options.commitHistory).toHaveBeenCalledOnce();
  });
}

function registerInlineStyleToggleTests() {
  it('toggles every inline style command from complete selection styles', () => {
    const cases = [
      {
        command: 'italic' as const,
        current: [{ fontStyle: 'italic' }, { fontStyle: 'italic' }],
        patch: { fontStyle: 'normal' },
      },
      {
        command: 'underline' as const,
        current: [{ underline: true }, { underline: true }],
        patch: { underline: false },
      },
      {
        command: 'linethrough' as const,
        current: [{ linethrough: false }, { linethrough: true }],
        patch: { linethrough: true },
      },
    ];

    cases.forEach((item) => {
      const textbox = {
        getSelectionStyles: vi.fn(() => item.current),
        kind: 'textbox',
        sniptaleType: 'text',
        selectionEnd: 4,
        selectionStart: 0,
        setSelectionStyles: vi.fn(),
      };

      applyEditorTextSelectionStyle(createFormattingOptions(textbox) as never, item.command);

      expect(textbox.setSelectionStyles).toHaveBeenCalledWith(item.patch, 0, 4);
    });
  });
}

function registerFormattingGuardTests() {
  it('skips collapsed or non-text selections', () => {
    const textbox = {
      isEditing: true,
      kind: 'textbox',
      sniptaleType: 'text',
      selectionEnd: 2,
      selectionStart: 2,
      setSelectionStyles: vi.fn(),
    };
    const options = createFormattingOptions(textbox);

    expect(applyEditorTextSelectionStyle(options as never, 'underline')).toBe(false);
    expect(textbox.setSelectionStyles).not.toHaveBeenCalled();
    expect(options.commitHistory).not.toHaveBeenCalled();

    expect(applyEditorTextSelectionStyle(createFormattingOptions(null) as never, 'bold')).toBe(
      false
    );
  });

  it('applies inline styles to meta stamps through the shared textbox seam', () => {
    const textbox = {
      getSelectionStyles: vi.fn(() => [{ fontWeight: 'normal' }, { fontWeight: 'normal' }]),
      kind: 'textbox',
      sniptaleType: 'meta-stamp',
      selectionEnd: 3,
      selectionStart: 0,
      setSelectionStyles: vi.fn(),
    };

    expect(applyEditorTextSelectionStyle(createFormattingOptions(textbox) as never, 'bold')).toBe(
      true
    );
    expect(textbox.setSelectionStyles).toHaveBeenCalledWith({ fontWeight: 'bold' }, 0, 3);
  });
}

function registerFallbackPatchTests() {
  it('builds global setting fallback patches from current state', () => {
    const settings = {
      fontWeight: 'bold',
      fontStyle: 'italic',
      underline: false,
      linethrough: true,
    } as never;

    expect(getTextSettingsStylePatch(settings, 'bold')).toEqual({ fontWeight: 'normal' });
    expect(getTextSettingsStylePatch(settings, 'italic')).toEqual({ fontStyle: 'normal' });
    expect(getTextSettingsStylePatch(settings, 'underline')).toEqual({ underline: true });
    expect(getTextSettingsStylePatch(settings, 'linethrough')).toEqual({ linethrough: false });
  });
}

describe('editor text formatting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  registerInlineStyleApplicationTests();
  registerInlineStyleToggleTests();
  registerFormattingGuardTests();
  registerFallbackPatchTests();
});
