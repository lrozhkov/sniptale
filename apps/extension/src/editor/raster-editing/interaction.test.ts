// @vitest-environment jsdom
import { Canvas, FabricImage, getEnv } from 'fabric';
import { expect, it, vi } from 'vitest';
import type { RasterTargetAdapter, RasterTarget } from './adapters';
import { createEditorRasterMetadata } from './image-state';
import { mountRasterInteraction } from './interaction';
import { createRasterSession } from './session';
import type { RasterComputeClient } from './compute';
function event(
  element: HTMLElement,
  type: string,
  x = 1,
  y = 1,
  pointerId = 1,
  modifiers: Pick<MouseEventInit, 'shiftKey' | 'ctrlKey'> = {}
) {
  const value = new MouseEvent(type, {
    clientX: x,
    clientY: y,
    button: 0,
    bubbles: true,
    cancelable: true,
    ...modifiers,
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
  const compute: RasterComputeClient = { run: vi.fn(), cancel: vi.fn(), dispose: vi.fn() };
  const session = createRasterSession({
    adapter,
    compute,
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
  return { canvas, session, element, interaction, adapter, target, compute };
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
      expect(session.getSnapshot().selection).toBe(reason === 'tool' ? 'none' : 'active');
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

it('keeps pixel tools on their target and exposes tool and prohibited cursors without losing the mask', async () => {
  const { canvas, session, element, interaction, target } = interactionFixture();
  const downstream = vi.fn();
  element.addEventListener('pointerdown', downstream);
  const hideCursor = vi.spyOn(session, 'hideCursor');
  try {
    session.selectAll();
    expect(session.getSnapshot().selection).toBe('active');
    session.setTool('fill');
    event(element, 'pointermove', 1, 1);
    const fillCursor = element.style.cursor;
    expect(fillCursor).toContain('data:image/svg+xml');
    expect(fillCursor).not.toContain('e03131');
    event(element, 'pointermove', 10, 10);
    expect(element.style.cursor).toContain('e03131');
    expect(event(element, 'pointerdown', 10, 10).defaultPrevented).toBe(true);
    expect(downstream).not.toHaveBeenCalled();
    expect(session.getSnapshot().selection).toBe('active');
    session.setTool('restore');
    event(element, 'pointermove', 1, 1);
    expect(element.style.cursor).not.toBe(fillCursor);
    expect(element.style.cursor).not.toContain('e03131');
    event(element, 'pointerleave', 1, 1);
    expect(hideCursor).toHaveBeenCalled();
    expect(element.style.cursor).toBe(canvas.defaultCursor);
    expect(session.getSnapshot().selection).toBe('active');
    target.geometry = {
      ...target.geometry,
      sourceClip: { x: 2, y: 2, width: 2, height: 2 },
    };
    event(element, 'pointermove', 1, 1);
    expect(element.style.cursor).toContain('e03131');
    event(element, 'pointermove', 3, 3);
    expect(element.style.cursor).not.toContain('e03131');
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    expect(event(element, 'pointerdown', 10, 10).defaultPrevented).toBe(false);
    expect(downstream).toHaveBeenCalledOnce();
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
  } finally {
    interaction.dispose();
    session.dispose();
    await canvas.dispose();
  }
});

it('allows crop gestures in retained source pixels but blocks starts outside the source', async () => {
  const { canvas, session, element, interaction, target } = interactionFixture();
  try {
    target.geometry = { ...target.geometry, crop: { x: 1, y: 1, width: 2, height: 2 } };
    session.setTool('crop');
    event(element, 'pointermove', 0.5, 0.5);
    expect(element.style.cursor).not.toContain('e03131');
    event(element, 'pointermove', 12, 12);
    expect(element.style.cursor).toContain('e03131');
    const begin = vi.spyOn(session, 'beginGesture');
    expect(event(element, 'pointerdown', 12, 12).defaultPrevented).toBe(true);
    expect(begin).not.toHaveBeenCalled();
  } finally {
    interaction.dispose();
    session.dispose();
    await canvas.dispose();
  }
});

it('yields canvas shortcuts to an open floating parameter dialog after its field blurs', async () => {
  const { canvas, session, interaction } = interactionFixture();
  const popup = document.createElement('div');
  popup.setAttribute('role', 'dialog');
  popup.dataset['floatingUiRoot'] = 'true';
  document.body.appendChild(popup);
  const cancel = vi.spyOn(session, 'cancel');
  try {
    session.setTool('select');
    session.selectAll();
    cancel.mockClear();
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.body.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(false);
    expect(cancel).not.toHaveBeenCalled();
    expect(session.getSnapshot().selection).toBe('active');
  } finally {
    popup.remove();
    interaction.dispose();
    session.dispose();
    await canvas.dispose();
  }
});

it('captures live selection modifiers without changing persistent settings', async () => {
  const { canvas, session, element, interaction } = interactionFixture();
  const begin = vi.spyOn(session, 'beginGesture').mockReturnValue(false);
  try {
    for (const method of ['rectangle', 'lasso', 'wand'] as const) {
      session.setSelectionMethod(method);
      event(element, 'pointermove', 1, 1);
      const replaceCursor = element.style.cursor;
      expect(replaceCursor).toContain('7 7, crosshair');
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', shiftKey: true }));
      const addCursor = element.style.cursor;
      expect(addCursor).not.toBe(replaceCursor);
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift' }));
      expect(element.style.cursor).toBe(replaceCursor);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Control', ctrlKey: true }));
      const subtractCursor = element.style.cursor;
      expect(subtractCursor).not.toBe(replaceCursor);
      expect(subtractCursor).not.toBe(addCursor);
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Shift', shiftKey: true, ctrlKey: true })
      );
      expect(element.style.cursor).toBe(addCursor);
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift', ctrlKey: true }));
      expect(element.style.cursor).toBe(subtractCursor);
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Control' }));
      expect(element.style.cursor).toBe(replaceCursor);
      for (const [modifiers, expected] of [
        [{}, 'new'],
        [{ shiftKey: true }, 'add'],
        [{ ctrlKey: true }, 'subtract'],
        [{ shiftKey: true, ctrlKey: true }, 'add'],
      ] as const) {
        event(element, 'pointerdown', 1, 1, 1, modifiers);
        expect(begin).toHaveBeenLastCalledWith({ x: 1, y: 1 }, expected);
        expect(session.getSnapshot().selectionMode).toBe('new');
      }
    }
    session.setTool('fill');
    event(element, 'pointerdown', 1, 1, 1, { shiftKey: true });
    expect(begin).toHaveBeenLastCalledWith({ x: 1, y: 1 });
  } finally {
    interaction.dispose();
    session.dispose();
    await canvas.dispose();
  }
});

it('finishes crop in cursor mode, owns the full Enter cycle and can cancel a later crop draft', async () => {
  const { canvas, session, adapter, interaction, compute, target } = interactionFixture();
  vi.mocked(compute.run).mockImplementation(async (command) =>
    command.kind === 'decode'
      ? {
          kind: 'decoded',
          pixels: {
            width: 4,
            height: 4,
            color: new Uint8ClampedArray(64).fill(255),
            visibility: null,
            key: null,
          },
        }
      : {
          kind: 'encoded',
          candidate: {
            metadata: structuredClone(target.metadata),
            visibleFullDataUrl: target.metadata.sniptaleRasterOriginalData,
          },
        }
  );
  try {
    session.setTool('crop');
    await Promise.resolve();
    await Promise.resolve();
    session.beginGesture({ x: 1, y: 1 });
    await session.endGesture({ x: 3, y: 3 });
    for (const [key, ctrlKey] of [
      ['Delete', false],
      ['a', true],
    ] as const) {
      const command = new KeyboardEvent('keydown', {
        key,
        ctrlKey,
        bubbles: true,
        cancelable: true,
      });
      document.body.dispatchEvent(command);
      expect(command.defaultPrevented).toBe(true);
      expect(session.getSnapshot()).toMatchObject({ cropPending: true, selection: 'none' });
      expect(adapter.publish).not.toHaveBeenCalled();
    }
    document.body.append(canvas.wrapperEl);
    const toolbarButton = document.createElement('button');
    toolbarButton.dataset['ui'] = 'editor.raster.crop';
    document.body.append(toolbarButton);
    toolbarButton.focus();
    const apply = vi.spyOn(session, 'applyCrop');
    const key = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    document.body.dispatchEvent(key);
    expect(key.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(adapter.publish).toHaveBeenCalledOnce());
    expect(apply).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(session.getSnapshot().busy).toBe(false));
    expect(session.getSnapshot()).toMatchObject({ editing: true, tool: null });
    expect(document.activeElement).toBe(canvas.upperCanvasEl);
    const repeat = new KeyboardEvent('keydown', {
      key: 'Enter',
      repeat: true,
      bubbles: true,
      cancelable: true,
    });
    toolbarButton.dispatchEvent(repeat);
    expect(repeat.defaultPrevented).toBe(true);
    const release = new KeyboardEvent('keyup', { key: 'Enter', bubbles: true, cancelable: true });
    document.body.dispatchEvent(release);
    expect(release.defaultPrevented).toBe(true);
    expect(apply).toHaveBeenCalledOnce();
    toolbarButton.remove();
    session.setTool('crop');
    await Promise.resolve();
    await Promise.resolve();
    session.beginGesture({ x: 1, y: 1 });
    await session.endGesture({ x: 3, y: 3 });
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    );
    expect(session.getSnapshot()).toMatchObject({
      editing: true,
      tool: 'crop',
      cropPending: false,
    });
    expect(adapter.publish).toHaveBeenCalledOnce();
  } finally {
    interaction.dispose();
    session.dispose();
    await canvas.dispose();
  }
});

it.each(['brush', 'erase', 'restore'] as const)(
  'uses only the size overlay for %s and restores native cursors outside its target',
  async (tool) => {
    const { canvas, session, element, interaction } = interactionFixture();
    const move = vi.spyOn(session, 'moveCursor');
    try {
      session.setTool(tool);
      event(element, 'pointermove', 1, 1);
      expect(element.style.cursor).toBe('none');
      expect(move).toHaveBeenLastCalledWith({ x: 1, y: 1 });
      event(element, 'pointermove', 10, 10);
      expect(element.style.cursor).toContain('e03131');
      event(element, 'pointerleave');
      expect(element.style.cursor).toBe(canvas.defaultCursor);
      event(element, 'pointermove', 1, 1);
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
      expect(element.style.cursor).toBe(canvas.defaultCursor);
    } finally {
      interaction.dispose();
      session.dispose();
      await canvas.dispose();
    }
  }
);
