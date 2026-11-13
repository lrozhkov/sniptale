// @vitest-environment jsdom
import { Canvas, FabricImage, getEnv } from 'fabric';
import { expect, it, vi } from 'vitest';
import type { RasterTargetAdapter, RasterTarget } from './adapters';
import { createEditorRasterMetadata } from './image-state';
import { mountRasterInteraction } from './interaction';
import { createRasterSession } from './session';
function event(element: HTMLElement, type: string, x = 1, y = 1, pointerId = 1) {
  const value = new MouseEvent(type, {
    clientX: x,
    clientY: y,
    button: 0,
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(value, 'pointerId', { value: pointerId });
  element.dispatchEvent(value);
  return value;
}
function interactionFixture(
  options: { getMainTool?: () => string; isPanning?: () => boolean } = {}
) {
  const canvas = new Canvas(undefined, { width: 20, height: 20, renderOnAddRemove: false });
  const bitmap = getEnv().document.createElement('canvas');
  bitmap.width = bitmap.height = 4;
  const image = new FabricImage(bitmap);
  const target: RasterTarget = {
    identity: image,
    id: 'image',
    metadata: createEditorRasterMetadata(bitmap.toDataURL(), 4, 4),
    geometry: {
      width: 4,
      height: 4,
      crop: { x: 0, y: 0, width: 4, height: 4 },
      sourceToScene: [1, 0, 0, 1, 0, 0],
      periodic: false,
    },
    permission: 'allowed',
    kind: 'image',
    label: '',
    revision: 'one',
  };
  const adapter: RasterTargetAdapter = {
    prepareBackgroundCorrection: async () => {
      throw new Error('unused correction');
    },
    prepareNativeCorrectionPreview: async () => null,
    prepareCorrectionPreview: async () => null,
    publishCorrection: async () => false,
    resolve: () => target,
    resolveById: () => target,
    hydrateTarget: async () => {},
    isCurrent: () => true,
    publish: vi.fn(async () => true),
    copy: vi.fn(async () => true),
    flip: vi.fn(async () => true),
    allowContentEditing: () => true,
    preparePreview: async () => null,
  };
  const session = createRasterSession({
    adapter,
    compute: { run: vi.fn(), cancel: vi.fn(), dispose: vi.fn() },
    presentation: {
      pixels: vi.fn(),
      selection: vi.fn(),
      crop: vi.fn(),
      prepared: vi.fn(),
      clear: vi.fn(),
    },
  });
  session.setTool('select');
  const element = canvas.upperCanvasEl;
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 20,
    height: 20,
    right: 20,
    bottom: 20,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  const interaction = mountRasterInteraction({ canvas, session, ...options });
  return { canvas, session, element, interaction, adapter };
}
it('routes raster gestures and preserves pan, input, and dialog keyboard owners', async () => {
  const { canvas, session, element, interaction } = interactionFixture();
  const downstream = vi.fn();
  element.addEventListener('pointerdown', downstream);
  expect(event(element, 'pointerdown').defaultPrevented).toBe(true);
  expect(downstream).not.toHaveBeenCalled();
  event(element, 'pointermove', 3, 3);
  event(element, 'lostpointercapture');
  expect(session.getSnapshot().selection).toBe('none');
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
  expect(event(element, 'pointerdown').defaultPrevented).toBe(false);
  expect(downstream).toHaveBeenCalledOnce();
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
  const input = document.createElement('input');
  document.body.append(input);
  const key = new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true });
  input.dispatchEvent(key);
  expect(key.defaultPrevented).toBe(false);
  input.remove();
  document.body.append(canvas.wrapperEl);
  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');
  const button = document.createElement('button');
  dialog.append(button);
  document.body.append(dialog);
  const documentKeydown = vi.fn();
  document.addEventListener('keydown', documentKeydown);
  const cancel = vi.spyOn(session, 'cancel');
  const popupEscape = new KeyboardEvent('keydown', {
    key: 'Escape',
    bubbles: true,
    cancelable: true,
  });
  button.dispatchEvent(popupEscape);
  expect(documentKeydown).toHaveBeenCalledOnce();
  expect(popupEscape.defaultPrevented).toBe(false);
  expect(cancel).not.toHaveBeenCalled();
  dialog.remove();
  const trigger = document.createElement('button');
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'true');
  const triggerLabel = document.createElement('span');
  trigger.append(triggerLabel);
  const listbox = document.createElement('div');
  listbox.setAttribute('role', 'listbox');
  listbox.setAttribute('data-floating-ui-root', 'true');
  const option = document.createElement('button');
  option.setAttribute('role', 'option');
  listbox.append(option);
  document.body.append(trigger, listbox);
  const selectKeydown = vi.fn((event: KeyboardEvent) => {
    if (event.key === 'Escape') event.preventDefault();
  });
  trigger.addEventListener('keydown', selectKeydown);
  option.addEventListener('keydown', selectKeydown);
  for (const control of [triggerLabel, option])
    control.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    );
  expect(selectKeydown).toHaveBeenCalledTimes(2);
  expect(cancel).not.toHaveBeenCalled();
  expect(documentKeydown).toHaveBeenCalledTimes(3);
  trigger.setAttribute('aria-expanded', 'false');
  const closedEscape = new KeyboardEvent('keydown', {
    key: 'Escape',
    bubbles: true,
    cancelable: true,
  });
  triggerLabel.dispatchEvent(closedEscape);
  expect(closedEscape.defaultPrevented).toBe(true);
  expect(cancel).toHaveBeenCalledOnce();
  expect(selectKeydown).toHaveBeenCalledTimes(2);
  trigger.remove();
  listbox.remove();
  cancel.mockClear();
  event(element, 'pointerdown');
  event(element, 'pointermove', 3, 3);
  const canvasEscape = new KeyboardEvent('keydown', {
    key: 'Escape',
    bubbles: true,
    cancelable: true,
  });
  element.dispatchEvent(canvasEscape);
  expect(canvasEscape.defaultPrevented).toBe(true);
  expect(cancel).toHaveBeenCalledOnce();
  expect(session.getSnapshot().selection).toBe('none');
  expect(documentKeydown).toHaveBeenCalledTimes(3);
  document.removeEventListener('keydown', documentKeydown);
  session.setTool(null);
  expect(event(element, 'pointerdown').defaultPrevented).toBe(false);
  interaction.dispose();
  session.dispose();
  await canvas.dispose();
});

it('completes captured release and cancels on lost pointer, blur, Space or tool exit', async () => {
  const { canvas, session, element, interaction } = interactionFixture();
  let captured = false;
  const capture = vi.fn(() => {
      captured = true;
    }),
    release = vi.fn(() => {
      captured = false;
    });
  Object.defineProperties(element, {
    setPointerCapture: { value: capture, configurable: true },
    hasPointerCapture: { value: () => captured, configurable: true },
    releasePointerCapture: { value: release, configurable: true },
  });
  try {
    const selected = new Promise<void>((resolve) => {
      const remove = session.subscribe(() => {
        if (session.getSnapshot().selection === 'active') {
          remove();
          resolve();
        }
      });
    });
    event(element, 'pointerdown');
    event(element, 'pointermove', 3, 3);
    expect(event(element, 'pointerup', 3, 3, 2).defaultPrevented).toBe(false);
    event(element, 'pointerup', 3, 3);
    await selected;
    expect(capture).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
    const cancel = vi.spyOn(session, 'cancel');
    for (const reason of ['pointercancel', 'blur', 'space', 'tool'] as const) {
      event(element, 'pointerdown');
      event(element, 'pointermove', 2, 2);
      if (reason === 'pointercancel') event(element, 'pointercancel');
      if (reason === 'blur') window.dispatchEvent(new Event('blur'));
      if (reason === 'space') {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
      }
      if (reason === 'tool') session.setTool(null);
      expect(captured).toBe(false);
      expect(session.getSnapshot().selection).toBe('active');
    }
    expect(cancel).toHaveBeenCalledTimes(3);
    expect(release).toHaveBeenCalledTimes(5);
  } finally {
    interaction.dispose();
    session.dispose();
    await canvas.dispose();
  }
});
it('keeps main tool and panning admission while routing active pixel shortcuts and hover', async () => {
  let mainTool = 'pencil',
    panning = false;
  const { canvas, session, element, interaction } = interactionFixture({
    getMainTool: () => mainTool,
    isPanning: () => panning,
  });
  const hide = vi.spyOn(session, 'hideSelected').mockResolvedValue(),
    cursor = vi.spyOn(session, 'moveCursor');
  try {
    expect(event(element, 'pointerdown').defaultPrevented).toBe(false);
    mainTool = 'select';
    panning = true;
    expect(event(element, 'pointerdown').defaultPrevented).toBe(false);
    panning = false;
    document.body.append(canvas.wrapperEl);
    event(element, 'pointermove');
    expect(cursor).toHaveBeenCalledOnce();
    const selectAll = new KeyboardEvent('keydown', {
      key: 'a',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    element.dispatchEvent(selectAll);
    expect(selectAll.defaultPrevented).toBe(true);
    expect(session.getSnapshot().selection).toBe('active');
    const ordinary = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
    element.dispatchEvent(ordinary);
    expect(ordinary.defaultPrevented).toBe(false);
    for (const key of ['Delete', 'Backspace']) {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      element.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }
    expect(hide).toHaveBeenCalledTimes(2);
    session.setTool(null);
    const outside = new KeyboardEvent('keydown', {
      key: 'Delete',
      bubbles: true,
      cancelable: true,
    });
    element.dispatchEvent(outside);
    expect(outside.defaultPrevented).toBe(false);
  } finally {
    interaction.dispose();
    session.dispose();
    await canvas.dispose();
  }
});
