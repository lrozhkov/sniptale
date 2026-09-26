// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const { getCurrentLocaleMock } = vi.hoisted(() => ({
  getCurrentLocaleMock: vi.fn(),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  formatDateTime: vi.fn(() => 'Apr 7, 2026, 10:15 AM'),
  getCurrentLocale: getCurrentLocaleMock,
  translate: vi.fn((key: string) => key),
}));

vi.mock('../core/helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../core/helpers')>()),
  getBrowserVersion: vi.fn(() => 'Chrome 136'),
}));

import { readEditorDrawingObject } from '../../drawing/object/metadata';
import { createEditorDrawingFabricObject } from '../../drawing/object/vector';
import { createTechnicalDataTextObject } from './insertions';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'uuid-1') });
  getCurrentLocaleMock.mockReturnValue('en');
});

it('clamps technical data text inside the source bounds before preparing it', () => {
  const prepareObject = vi.fn();

  const result = createTechnicalDataTextObject({
    kinds: ['browser', 'url', 'date'],
    nextLabelIndex: 5,
    prepareObject,
    source: {
      displayHeight: 500,
      displayWidth: 300,
      left: 10,
      top: 20,
    } as never,
    sourceTitle: 'Welcome',
    sourceUrl: 'https://example.com',
    textSettings: {
      backgroundColor: '#123456',
      color: '#ffffff',
      fontFamily: 'mono',
      fontSize: 16,
    },
  });

  const drawing = readEditorDrawingObject(result);
  expect(result).toMatchObject({
    left: 30,
    sniptaleId: 'drawing-uuid-1',
    sniptaleRole: 'annotation',
    sniptaleType: 'text',
  });
  expect(result.top).toBeGreaterThanOrEqual(40);
  expect((result.top ?? 0) + result.getScaledHeight()).toBeLessThanOrEqual(500);
  expect(drawing).toMatchObject({
    id: 'drawing-uuid-1',
    kind: 'text',
    text: expect.stringContaining('https://example.com'),
  });
  expect(
    Math.abs((drawing?.kind === 'text' ? drawing.bounds.y : -1) - (result.top ?? 0))
  ).toBeLessThanOrEqual(1);
  expect(prepareObject).toHaveBeenCalledWith(result);
});

it.each(['column', 'row'] as const)(
  'fits every visible %s line and its selection inside a narrow image',
  (layout) => {
    const source = {
      displayHeight: 180,
      displayWidth: 280,
      left: 10,
      top: 20,
    };
    const result = createTechnicalDataTextObject({
      kinds: ['url', 'date', 'browser'],
      layout,
      nextLabelIndex: 5,
      prepareObject: vi.fn(),
      source: source as never,
      sourceTitle: 'A page with a long descriptive title',
      sourceUrl: `https://example.com/${'long-path-segment/'.repeat(8)}`,
      textSettings: {
        backgroundColor: null,
        color: '#ffffff',
        fontFamily: 'mono',
        fontSize: 20,
      },
    });

    if ('calcTextHeight' in result && typeof result.calcTextHeight === 'function') {
      expect(result.height).toBeGreaterThanOrEqual(result.calcTextHeight());
    }
    expect(result.left).toBeGreaterThanOrEqual(source.left);
    expect(result.top).toBeGreaterThanOrEqual(source.top);
    expect((result.left ?? 0) + result.getScaledWidth()).toBeLessThanOrEqual(
      source.left + source.displayWidth
    );
    expect((result.top ?? 0) + result.getScaledHeight()).toBeLessThanOrEqual(
      source.top + source.displayHeight
    );
    if ('calcTextHeight' in result && typeof result.calcTextHeight === 'function') {
      expect(result.calcTextHeight() * result.scaleY).toBeLessThanOrEqual(
        result.getScaledHeight() + 0.5
      );
    }
    const drawing = readEditorDrawingObject(result);
    if (!drawing || drawing.kind !== 'text') throw new Error('Expected text drawing');
    const restored = createEditorDrawingFabricObject(drawing, 5);
    expect((restored.left ?? 0) + restored.getScaledWidth()).toBeLessThanOrEqual(
      source.left + source.displayWidth
    );
    expect((restored.top ?? 0) + restored.getScaledHeight()).toBeLessThanOrEqual(
      source.top + source.displayHeight
    );
  }
);

it('reduces the font when column data fits the width but not the available height', () => {
  const result = createTechnicalDataTextObject({
    kinds: ['url', 'date', 'browser'],
    layout: 'column',
    nextLabelIndex: 6,
    prepareObject: vi.fn(),
    source: {
      displayHeight: 90,
      displayWidth: 500,
      left: 0,
      top: 0,
    } as never,
    sourceTitle: '',
    sourceUrl: 'https://example.com',
    textSettings: {
      backgroundColor: null,
      color: '#ffffff',
      fontFamily: 'mono',
      fontSize: 20,
    },
  });

  const drawing = readEditorDrawingObject(result);
  expect(drawing?.kind === 'text' ? drawing.fontSize : 20).toBeLessThan(20);
  expect((result.top ?? 0) + result.getScaledHeight()).toBeLessThanOrEqual(90);
});
