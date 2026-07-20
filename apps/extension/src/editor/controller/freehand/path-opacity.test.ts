import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createFabricShadowMock: vi.fn(() => null),
}));

vi.mock('../../objects/shadow', async () => ({
  ...(await vi.importActual<typeof import('../../objects/shadow')>('../../objects/shadow')),
  createFabricShadow: mocks.createFabricShadowMock,
}));
vi.mock('../../document/model', async () => {
  const actual =
    await vi.importActual<typeof import('../../document/model')>('../../document/model');

  return {
    ...actual,
    createObjectLabel: (type: string, index: number) => `${type}-${index}`,
  };
});
import type { EditorBrushSettings } from '../../../features/editor/document/types';
import { configureFreehandPath } from './path/configure';
import { readFreehandOpacity } from './path-readers';

const highlighterSettings: EditorBrushSettings = {
  color: '#ffee00',
  dynamicWidth: false,
  opacity: 0.4,
  shapeCorrection: 'off',
  shadow: 0,
  shadowAngle: 90,
  shadowColor: '#ffee00',
  smoothingLevel: 4,
  width: 12,
};

describe('editor-controller freehand path opacity seam', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('crypto', { randomUUID: () => 'uuid-highlighter' });
  });

  it('keeps highlighter path opacity in the stroke color so preview and committed paths match', () => {
    const path = { set: vi.fn() };

    configureFreehandPath({
      brush: null,
      labelIndex: 2,
      path: path as never,
      settings: highlighterSettings,
      tool: 'highlighter',
    });

    expect(path.set).toHaveBeenCalledWith(
      expect.objectContaining({
        fill: '',
        opacity: 1,
        stroke: 'rgba(255, 238, 0, 0.4)',
        strokeWidth: 12,
      })
    );
  });

  it('reads brush opacity from rgba color before legacy object opacity', () => {
    expect(
      readFreehandOpacity(
        { opacity: 1, stroke: 'rgba(255, 238, 0, 0.4)' } as never,
        highlighterSettings.opacity
      )
    ).toBe(0.4);
    expect(
      readFreehandOpacity({ opacity: 0.6, stroke: '#ffee00' } as never, highlighterSettings.opacity)
    ).toBe(0.6);
  });
});
