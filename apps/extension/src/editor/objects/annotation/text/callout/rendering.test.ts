import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyCanvasShadowMock: vi.fn(),
  getTextCalloutDimensionsMock: vi.fn(() => ({ height: 40, width: 90 })),
  getTextCalloutFrameMock: vi.fn(() => ({ height: 40, left: 0, top: 0, width: 90 })),
  getTextCalloutPathMock: vi.fn(() => 'M 0 0 Z'),
  traceTextCalloutPathMock: vi.fn(() => false),
}));

vi.mock('../../../shadow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../shadow')>()),
  applyCanvasShadow: mocks.applyCanvasShadowMock,
}));
vi.mock('../formats', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../formats')>()),
  getTextCalloutPath: mocks.getTextCalloutPathMock,
  traceTextCalloutPath: mocks.traceTextCalloutPathMock,
}));
vi.mock('../geometry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../geometry')>()),
  getTextCalloutFrame: mocks.getTextCalloutFrameMock,
}));
vi.mock('./dimensions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./dimensions')>()),
  getTextCalloutDimensions: mocks.getTextCalloutDimensionsMock,
}));

import { renderTextCalloutBackground } from './rendering';

afterEach(() => {
  vi.unstubAllGlobals();
});

function createContext() {
  return {
    fill: vi.fn(),
    fillRect: vi.fn(),
    globalAlpha: 1,
    restore: vi.fn(),
    save: vi.fn(),
  };
}

it('renders text callout backgrounds through Path2D when available', () => {
  const pathCtor = vi.fn();
  vi.stubGlobal('Path2D', pathCtor);
  const context = createContext();

  renderTextCalloutBackground(
    {
      backgroundColor: '#223344',
      sniptaleTextBackgroundOpacity: 0.4,
      sniptaleTextCalloutFormat: 'panel',
      sniptaleTextCalloutShadow: 20,
    } as never,
    context as never
  );

  expect(pathCtor).toHaveBeenCalledWith('M 0 0 Z');
  expect(context.fill).toHaveBeenCalledOnce();
  expect(mocks.applyCanvasShadowMock).toHaveBeenCalled();
  expect(context.restore).toHaveBeenCalledOnce();
});

it('falls back to a rectangle when the path cannot be traced', () => {
  vi.stubGlobal('Path2D', undefined);
  const context = createContext();

  renderTextCalloutBackground(
    {
      backgroundColor: '#223344',
      sniptaleTextCalloutFormat: 'panel',
    } as never,
    context as never
  );

  expect(context.fillRect).toHaveBeenCalledWith(0, 0, 90, 40);
});

it('skips rendering for missing path or fill', () => {
  const context = createContext();

  renderTextCalloutBackground(
    { backgroundColor: ' ', sniptaleTextCalloutFormat: 'panel' } as never,
    context as never
  );
  mocks.getTextCalloutPathMock.mockReturnValueOnce('');
  renderTextCalloutBackground(
    { backgroundColor: '#223344', sniptaleTextCalloutFormat: 'panel' } as never,
    context as never
  );

  expect(context.save).not.toHaveBeenCalled();
});
