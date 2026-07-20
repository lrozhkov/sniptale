import { expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_IMAGE_SETTINGS } from '../../features/editor/document/constants';
import type { EditorImageSettings } from '../../features/editor/document/image-types';
import { applyImageSettings } from './image-style';

function createObject() {
  const object = {
    getScaledHeight: vi.fn(() => 120),
    getScaledWidth: vi.fn(() => 160),
    height: 120,
    left: 32,
    scaleX: 0.5,
    scaleY: 0.5,
    set: vi.fn((patch: Record<string, unknown>) => Object.assign(object, patch)),
    setCoords: vi.fn(),
    top: 48,
    width: 160,
  };

  return object;
}

it('applies image opacity, border dash, custom radius, and shadow metadata', () => {
  const object = createObject();

  applyImageSettings(object as never, {
    ...DEFAULT_EDITOR_IMAGE_SETTINGS,
    opacity: 0.6,
    radius: 18,
    shadow: 45,
    shadowColor: '#111111',
    strokeColor: '#123456',
    strokeOpacity: 0.5,
    strokeStyle: 'dash-dot',
    strokeWidth: 4,
  });

  expect((object as Record<string, unknown>)['sniptaleImageOpacity']).toBe(0.6);
  expect((object as Record<string, unknown>)['sniptaleImageRadius']).toBe(18);
  expect((object as Record<string, unknown>)['sniptaleImageShadowColor']).toBe('#111111');
  expect((object as Record<string, unknown>)['sniptaleImageStrokeStyle']).toBe('dash-dot');
  expect(object.set).toHaveBeenCalledWith(
    expect.objectContaining({
      clipPath: undefined,
      objectCaching: false,
      opacity: 0.6,
      stroke: null,
      strokeDashArray: undefined,
      strokeUniform: true,
      strokeWidth: 0,
    })
  );
  expect(object.set).not.toHaveBeenCalledWith(
    expect.objectContaining({
      left: expect.any(Number),
      scaleX: expect.any(Number),
      scaleY: expect.any(Number),
      top: expect.any(Number),
    })
  );
  expect(object.setCoords).toHaveBeenCalledOnce();
});

it('keeps shadow color independent from image border color fallback', () => {
  const object = createObject();
  const settings: EditorImageSettings = {
    ...DEFAULT_EDITOR_IMAGE_SETTINGS,
    shadow: 45,
    strokeColor: '#123456',
  };
  Reflect.deleteProperty(settings, 'shadowColor');

  applyImageSettings(object as never, settings);

  expect((object as Record<string, unknown>)['sniptaleImageShadowColor']).toBe(
    DEFAULT_EDITOR_IMAGE_SETTINGS.shadowColor
  );
});

it('clears optional image border geometry when radius and stroke width are disabled', () => {
  const object = createObject();

  applyImageSettings(object as never, {
    ...DEFAULT_EDITOR_IMAGE_SETTINGS,
    radius: 0,
    strokeStyle: 'solid',
    strokeWidth: 0,
  });

  expect(object.set).toHaveBeenCalledWith(
    expect.objectContaining({
      clipPath: undefined,
      stroke: null,
      strokeDashArray: undefined,
      strokeWidth: 0,
    })
  );
});

it.each([
  ['dashed', [12, 6.4]],
  ['dotted', [4, 7.6]],
  ['long-dash', [16, 6.4]],
] as const)('maps %s image borders to fabric dash arrays', (strokeStyle, strokeDashArray) => {
  const object = {
    ...createObject(),
    _render: vi.fn(),
  };
  const context = {
    beginPath: vi.fn(),
    closePath: vi.fn(),
    clip: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    setLineDash: vi.fn(),
    stroke: vi.fn(),
  };

  applyImageSettings(object as never, {
    ...DEFAULT_EDITOR_IMAGE_SETTINGS,
    strokeStyle,
    strokeWidth: 4,
  });
  object._render(context as never);

  expect(context.setLineDash).toHaveBeenCalledWith(strokeDashArray);
});

it('renders image borders around the image instead of using Fabric image stroke geometry', () => {
  const baseRender = vi.fn();
  const object = createObject() as ReturnType<typeof createObject> & {
    _render: typeof baseRender;
  };
  object._render = baseRender;
  const context = {
    beginPath: vi.fn(),
    closePath: vi.fn(),
    clip: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    rect: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    setLineDash: vi.fn(),
    stroke: vi.fn(),
  };

  applyImageSettings(object as never, {
    ...DEFAULT_EDITOR_IMAGE_SETTINGS,
    radius: 18,
    strokeColor: '#123456',
    strokeOpacity: 0.5,
    strokeStyle: 'dash-dot',
    strokeWidth: 4,
  });
  object._render(context as never);

  expect(baseRender).toHaveBeenCalledOnce();
  expect(context.clip).toHaveBeenCalledOnce();
  expect(context.moveTo).toHaveBeenCalledWith(-62, -62);
  expect(context.lineTo).toHaveBeenCalledWith(62, -62);
  expect(context.stroke).toHaveBeenCalledOnce();
  expect((object as Record<string, unknown>)['stroke']).toBeNull();
  expect((object as Record<string, unknown>)['strokeWidth']).toBe(0);
});

it('does not render the image frame with an independent shadow', () => {
  const baseRender = vi.fn();
  const object = createObject() as ReturnType<typeof createObject> & {
    _render: typeof baseRender;
  };
  object._render = baseRender;
  const context = {
    beginPath: vi.fn(),
    closePath: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    setLineDash: vi.fn(),
    shadowBlur: 18,
    shadowColor: '#abcdef',
    shadowOffsetX: 4,
    shadowOffsetY: 5,
    stroke: vi.fn(),
  };
  context.stroke.mockImplementation(() => {
    expect(context.shadowColor).toBe('rgba(0, 0, 0, 0)');
    expect(context.shadowBlur).toBe(0);
    expect(context.shadowOffsetX).toBe(0);
    expect(context.shadowOffsetY).toBe(0);
  });

  applyImageSettings(object as never, {
    ...DEFAULT_EDITOR_IMAGE_SETTINGS,
    shadow: 60,
    shadowColor: '#abcdef',
    strokeWidth: 4,
  });
  object._render(context as never);

  expect(baseRender).toHaveBeenCalledOnce();
  expect(context.stroke).toHaveBeenCalledOnce();
});

it('skips frame rendering when image border width is disabled', () => {
  const baseRender = vi.fn();
  const object = createObject() as ReturnType<typeof createObject> & {
    _render: typeof baseRender;
  };
  object._render = baseRender;
  const context = {
    stroke: vi.fn(),
  };

  applyImageSettings(object as never, {
    ...DEFAULT_EDITOR_IMAGE_SETTINGS,
    strokeWidth: 0,
  });
  object._render(context as never);

  expect(baseRender).toHaveBeenCalledOnce();
  expect(context.stroke).not.toHaveBeenCalled();
});

it('renders zero-radius image borders on the outer edge', () => {
  const baseRender = vi.fn();
  const object = createObject() as ReturnType<typeof createObject> & {
    _render: typeof baseRender;
  };
  object._render = baseRender;
  const context = {
    beginPath: vi.fn(),
    closePath: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    setLineDash: vi.fn(),
    stroke: vi.fn(),
  };

  applyImageSettings(object as never, {
    ...DEFAULT_EDITOR_IMAGE_SETTINGS,
    radius: 0,
    strokeStyle: 'solid',
    strokeWidth: 4,
  });
  object._render(context as never);

  expect(context.moveTo).toHaveBeenCalledWith(-80, -62);
  expect(context.lineTo).toHaveBeenCalledWith(80, -62);
  expect(context.setLineDash).toHaveBeenCalledWith([]);
  expect(context.stroke).toHaveBeenCalledOnce();
});
