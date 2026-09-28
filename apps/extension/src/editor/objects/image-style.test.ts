import { expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_IMAGE_SETTINGS } from '../../features/editor/document/constants';
import type { EditorImageSettings } from '../../features/editor/document/image-types';
import {
  applyImageSettings,
  isImageLayerStyleObject,
  readImageSettingsFromObject,
} from './image-style';
import { attachBrowserHeaderToImage } from './image-frame';

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

it('grows the centered source-image glow substantially across the size range', () => {
  const object = Object.assign(createObject(), { sniptaleType: 'source-image' });
  applyImageSettings(object as never, { ...DEFAULT_EDITOR_IMAGE_SETTINGS, shadow: 20 });
  const smallBlur = (object as unknown as { shadow?: { blur: number } }).shadow?.blur ?? 0;
  applyImageSettings(object as never, { ...DEFAULT_EDITOR_IMAGE_SETTINGS, shadow: 100 });
  const glow = (
    object as unknown as {
      shadow: { blur: number; offsetX: number; offsetY: number };
    }
  ).shadow;
  expect(glow.blur).toBeGreaterThan(smallBlur * 3);
  expect(glow.offsetX).toBe(0);
  expect(glow.offsetY).toBe(0);
});

it('retains independent shadow geometry for ordinary image layers', () => {
  const object = Object.assign(createObject(), { sniptaleType: 'image' });
  applyImageSettings(object as never, {
    ...DEFAULT_EDITOR_IMAGE_SETTINGS,
    shadow: 40,
    shadowBlur: 28,
    shadowDistance: 9,
  });
  const shadow = (
    object as unknown as {
      shadow: { blur: number; offsetY: number };
    }
  ).shadow;
  expect(shadow.blur).toBe(28);
  expect(shadow.offsetY).toBe(9);

  const defaults: EditorImageSettings = {
    ...DEFAULT_EDITOR_IMAGE_SETTINGS,
    shadow: 40,
  };
  Reflect.deleteProperty(defaults, 'shadowBlur');
  Reflect.deleteProperty(defaults, 'shadowDistance');
  applyImageSettings(object as never, defaults);
  const defaultShadow = (
    object as unknown as {
      shadow: { blur: number; offsetY: number };
    }
  ).shadow;
  expect(defaultShadow.blur).toBe(12);
  expect(defaultShadow.offsetY).toBe(4);
});

it('round-trips styled source-image settings while retaining defaults for a legacy image', () => {
  const source = Object.assign(createObject(), { sniptaleType: 'source-image' });
  const styled: EditorImageSettings = {
    ...DEFAULT_EDITOR_IMAGE_SETTINGS,
    borderPresetId: 'custom',
    opacity: 1,
    radius: 18,
    shadow: 70,
    shadowAngle: 45,
    shadowBlur: 22,
    shadowColor: '#abcdef',
    shadowDistance: 10,
    strokeColor: '#123456',
    strokeOpacity: 0.6,
    strokeStyle: 'dashed',
    strokeWidth: 3,
  };
  applyImageSettings(source as never, styled);
  expect(readImageSettingsFromObject(source as never)).toMatchObject(styled);
  expect(isImageLayerStyleObject(source as never)).toBe(true);
  expect(isImageLayerStyleObject({ sniptaleType: 'image' } as never)).toBe(true);
  expect(
    isImageLayerStyleObject({
      sniptaleType: 'background',
      sniptaleBackgroundMode: 'image',
    } as never)
  ).toBe(true);
  expect(isImageLayerStyleObject({ sniptaleType: 'background' } as never)).toBe(false);
  expect(isImageLayerStyleObject({ sniptaleImageRadius: 4 } as never)).toBe(true);
  expect(readImageSettingsFromObject(createObject() as never)).toMatchObject(
    DEFAULT_EDITOR_IMAGE_SETTINGS
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

it('keeps the source-image shadow outside its contour before drawing translucent content', () => {
  const baseRender = vi.fn((ctx: CanvasRenderingContext2D) => {
    expect(ctx.shadowBlur).toBe(0);
    expect(ctx.shadowColor).toBe('rgba(0, 0, 0, 0)');
  });
  const object = createObject() as ReturnType<typeof createObject> & {
    _render: typeof baseRender;
    sniptaleType: string;
  };
  object._render = baseRender;
  object.sniptaleType = 'source-image';
  const context = {
    beginPath: vi.fn(),
    clip: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    rect: vi.fn(),
    restore: vi.fn(),
    roundRect: vi.fn(),
    save: vi.fn(),
    shadowBlur: 18,
    shadowColor: '#abcdef',
    shadowOffsetX: 4,
    shadowOffsetY: 5,
  };

  applyImageSettings(object as never, {
    ...DEFAULT_EDITOR_IMAGE_SETTINGS,
    opacity: 0.5,
    radius: 12,
    shadow: 60,
  });
  object._render(context as never);

  expect(context.clip).toHaveBeenCalledWith('evenodd');
  expect(context.fill).toHaveBeenCalledOnce();
  expect(baseRender).toHaveBeenCalledOnce();
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

it('renders chrome and source through one rounded window contour and outer border', () => {
  const baseRender = vi.fn();
  const image = createObject() as ReturnType<typeof createObject> & {
    _render: typeof baseRender;
    sniptaleType: string;
  };
  image._render = baseRender;
  image.sniptaleType = 'source-image';
  const header = { width: 160, height: 86 } as HTMLImageElement;
  const context = {
    beginPath: vi.fn(),
    closePath: vi.fn(),
    clip: vi.fn(),
    drawImage: vi.fn(),
    fill: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    rect: vi.fn(),
    restore: vi.fn(),
    roundRect: vi.fn(),
    save: vi.fn(),
    setLineDash: vi.fn(),
    shadowBlur: 18,
    shadowColor: '#abcdef',
    shadowOffsetX: 4,
    shadowOffsetY: 5,
    stroke: vi.fn(),
  };
  applyImageSettings(image as never, {
    ...DEFAULT_EDITOR_IMAGE_SETTINGS,
    radius: 12,
    shadow: 45,
    strokeWidth: 4,
    opacity: 0.6,
  });
  attachBrowserHeaderToImage(image as never, header, 86);
  image._render(context as never);
  expect(context.drawImage).toHaveBeenCalledOnce();
  expect(baseRender).toHaveBeenCalledOnce();
  expect(context.clip).toHaveBeenCalledTimes(2);
  expect(context.clip).toHaveBeenCalledWith('evenodd');
  expect(context.roundRect).toHaveBeenCalledWith(-80, -232, 160, 292, 12);
  expect(context.fill).toHaveBeenCalledOnce();
  expect(context.moveTo).toHaveBeenCalledWith(-68, -232);
  expect(context.stroke).toHaveBeenCalledOnce();
});
