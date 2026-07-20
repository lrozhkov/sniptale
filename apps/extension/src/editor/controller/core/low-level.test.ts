// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isSourceObjectMock: vi.fn(() => false),
  isUserObjectMock: vi.fn(() => true),
}));

vi.mock('../../document/model', async () => {
  const actual =
    await vi.importActual<typeof import('../../document/model')>('../../document/model');

  return {
    ...actual,
    isSourceObject: mocks.isSourceObjectMock,
    isUserObject: mocks.isUserObjectMock,
  };
});

import { TRANSPARENT_COLOR } from '../../document/model';
import { applyEditorGridSnap } from '../viewport/grid';
import {
  createEditorSnapshotHistory,
  pushEditorSnapshotHistory,
  redoEditorSnapshot,
  undoEditorSnapshot,
} from '../history';
import {
  emptyCanvasJson,
  getBrowserVersion,
  isInteractiveShortcutTarget,
  nextStepLetter,
  parseColorForStore,
} from './helpers';
import {
  applyViewportPanSession,
  createViewportPanSession,
  shouldStartViewportPan,
} from '../input/pan';
import { createMockDocument } from '../instance/bindings/test-fixtures-document';

function setNavigatorValues(userAgent: string, appVersion = 'Fallback Browser') {
  Object.defineProperty(window.navigator, 'userAgent', {
    configurable: true,
    value: userAgent,
  });
  Object.defineProperty(window.navigator, 'appVersion', {
    configurable: true,
    value: appVersion,
  });
}

function createGridObject() {
  return {
    left: 13,
    set: vi.fn(function setPosition(
      this: { left: number; top: number },
      key: 'left' | 'top',
      value: number
    ) {
      this[key] = value;
      return this;
    }),
    setCoords: vi.fn(),
    top: 26,
  };
}

function registerHelperTests() {
  it('serializes the empty canvas payload and resolves browser names', () => {
    expect(emptyCanvasJson()).toBe('{"version":"7.2.0","objects":[]}');

    setNavigatorValues('Mozilla/5.0 Edg/124.0.2478.97');
    expect(getBrowserVersion()).toBe('Edge 124.0.2478.97');

    setNavigatorValues('Mozilla/5.0 YaBrowser/24.7.0.0');
    expect(getBrowserVersion()).toBe('Yandex 24.7.0.0');

    setNavigatorValues('Mozilla/5.0 Chrome/126.0.6478.5');
    expect(getBrowserVersion()).toBe('Chrome 126.0.6478.5');

    setNavigatorValues('Unknown Agent', 'Fallback Browser');
    expect(getBrowserVersion()).toBe('Fallback Browser');
  });

  it('rotates step letters and normalizes stored colors', () => {
    expect(nextStepLetter('', 'latin')).toBe('A');
    expect(nextStepLetter('A', 'latin')).toBe('B');
    expect(nextStepLetter('Я', 'cyrillic')).toBe('А');

    expect(parseColorForStore('', '#123456')).toBe('#123456');
    expect(parseColorForStore('', TRANSPARENT_COLOR)).toBe(TRANSPARENT_COLOR);
    expect(parseColorForStore('transparent', '#123456')).toBe(TRANSPARENT_COLOR);
    expect(parseColorForStore('rgba(10, 20, 30, 0)', '#123456')).toBe(TRANSPARENT_COLOR);
    expect(parseColorForStore('rgb(10, 20, 30)', '#123456')).toBe('#0a141e');
    expect(parseColorForStore('#abcdef00', '#123456')).toBe(TRANSPARENT_COLOR);
    expect(parseColorForStore('#abcdef88', '#123456')).toBe('#abcdef');
    expect(parseColorForStore('brand-token', '#123456')).toBe('brand-token');
  });

  it('detects interactive shortcut targets', () => {
    const input = document.createElement('input');
    const editable = document.createElement('div');
    Object.defineProperty(editable, 'isContentEditable', {
      configurable: true,
      value: true,
    });

    expect(isInteractiveShortcutTarget(input)).toBe(true);
    expect(isInteractiveShortcutTarget(editable)).toBe(true);
    expect(isInteractiveShortcutTarget(document.createElement('span'))).toBeFalsy();
    expect(isInteractiveShortcutTarget(null)).toBe(false);
  });
}

function registerGridTests() {
  it('snaps editable objects to the workspace grid', () => {
    const object = createGridObject();

    applyEditorGridSnap(
      object as never,
      {
        gridEnabled: true,
        gridSize: 10,
        gridSnapEnabled: true,
      } as never
    );

    expect(object.left).toBe(10);
    expect(object.top).toBe(30);
    expect(object.setCoords).toHaveBeenCalledOnce();
  });

  it('skips grid snapping for non-user and source-owned objects', () => {
    const object = createGridObject();

    mocks.isUserObjectMock.mockReturnValue(false);
    applyEditorGridSnap(
      object as never,
      {
        gridEnabled: true,
        gridSize: 10,
        gridSnapEnabled: true,
      } as never
    );

    mocks.isUserObjectMock.mockReturnValue(true);
    mocks.isSourceObjectMock.mockReturnValue(true);
    applyEditorGridSnap(
      object as never,
      {
        gridEnabled: true,
        gridSize: 10,
        gridSnapEnabled: true,
      } as never
    );

    expect(object.setCoords).not.toHaveBeenCalled();
  });
}

function registerHistoryTests() {
  it('tracks snapshot history and muting correctly', () => {
    const first = createMockDocument();
    const second = { ...createMockDocument(), sourceName: 'second.png' };
    const history = createEditorSnapshotHistory(first);

    expect(pushEditorSnapshotHistory({ exportDocument: () => second, history, muted: false })).toBe(
      true
    );
    expect(undoEditorSnapshot(history)).toEqual(first);
    expect(redoEditorSnapshot(history)).toEqual(second);
    expect(pushEditorSnapshotHistory({ exportDocument: () => second, history, muted: true })).toBe(
      false
    );
    expect(undoEditorSnapshot(null)).toBeNull();
    expect(redoEditorSnapshot(null)).toBeNull();
  });
}

function registerPanTests() {
  it('creates and applies viewport pan sessions from pointer deltas', () => {
    const viewport = document.createElement('div');
    viewport.scrollLeft = 120;
    viewport.scrollTop = 80;

    expect(shouldStartViewportPan({ button: 1 } as MouseEvent, false)).toBe(true);
    expect(shouldStartViewportPan({ button: 0 } as MouseEvent, true)).toBe(true);
    expect(shouldStartViewportPan({ button: 0 } as MouseEvent, false)).toBe(false);

    const session = createViewportPanSession(viewport, {
      clientX: 30,
      clientY: 50,
    } as MouseEvent);
    applyViewportPanSession(viewport, session, {
      clientX: 45,
      clientY: 70,
    } as MouseEvent);

    expect(viewport.scrollLeft).toBe(105);
    expect(viewport.scrollTop).toBe(60);
  });
}

function runCoreLowLevelSuite() {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isUserObjectMock.mockReturnValue(true);
    mocks.isSourceObjectMock.mockReturnValue(false);
    setNavigatorValues('Mozilla/5.0 Chrome/124.0.0.0');
  });

  registerHelperTests();
  registerGridTests();
  registerHistoryTests();
  registerPanTests();
}

describe('editor-controller core low-level seams', runCoreLowLevelSuite);
