// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getRichShapeTextCapability: vi.fn(() => true),
  isRichShapeObject: vi.fn(() => true),
  restoreShapeTextObjects: vi.fn(),
}));

vi.mock('../../objects/rich-shape', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../objects/rich-shape')>()),
  getRichShapeTextCapability: mocks.getRichShapeTextCapability,
  isRichShapeObject: mocks.isRichShapeObject,
}));

vi.mock('./session-lifecycle', async () => ({
  ...(await vi.importActual<typeof import('./session-lifecycle')>('./session-lifecycle')),
  restoreShapeTextObjects: mocks.restoreShapeTextObjects,
}));

import {
  closeRichShapeTextEditorSession,
  findEditableShapeObject,
  getActiveRichShapeTextEditorSession,
  isActiveShapeSelection,
  setActiveRichShapeTextEditorSession,
} from './session-registry';
import type { TextEditorSession } from './session-types';

function createCanvas(object: { sniptaleId: string }, activeObjects: unknown[] = [object]) {
  return {
    getActiveObjects: vi.fn(() => activeObjects),
    getObjects: vi.fn(() => [object]),
  } as never;
}

function createSession(overrides: Partial<TextEditorSession> = {}): TextEditorSession {
  return {
    cleanup: vi.fn(),
    closing: false,
    dirty: false,
    element: document.createElement('textarea'),
    hiddenTextObjects: [],
    objectId: 'shape-1',
    originalText: 'Original',
    ...overrides,
  };
}

describe('rich shape text editor session registry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRichShapeTextCapability.mockReturnValue(true);
    mocks.isRichShapeObject.mockReturnValue(true);
  });

  it('finds editable active shape sessions and clears them on close', () => {
    const object = { sniptaleId: 'shape-1' };
    const canvas = createCanvas(object);
    const session = createSession();
    document.body.append(session.element);

    setActiveRichShapeTextEditorSession(canvas, session);

    expect(getActiveRichShapeTextEditorSession(canvas)).toBe(session);
    expect(findEditableShapeObject(canvas, 'shape-1')).toBe(object);
    expect(isActiveShapeSelection(canvas, 'shape-1')).toBe(true);

    closeRichShapeTextEditorSession(canvas, session);

    expect(session.cleanup).toHaveBeenCalledOnce();
    expect(mocks.restoreShapeTextObjects).toHaveBeenCalledWith([]);
    expect(session.element.isConnected).toBe(false);
    expect(getActiveRichShapeTextEditorSession(canvas)).toBeNull();
  });

  it('guards unsupported objects and already closing sessions', () => {
    const object = { sniptaleId: 'shape-1' };
    const canvas = createCanvas(object, []);
    const session = createSession({ closing: true });
    mocks.getRichShapeTextCapability.mockReturnValue(false);

    expect(findEditableShapeObject(canvas, 'shape-1')).toBeNull();
    expect(isActiveShapeSelection(canvas, 'shape-1')).toBe(false);

    closeRichShapeTextEditorSession(canvas, session);

    expect(session.cleanup).not.toHaveBeenCalled();
    expect(mocks.restoreShapeTextObjects).not.toHaveBeenCalled();
  });
});
