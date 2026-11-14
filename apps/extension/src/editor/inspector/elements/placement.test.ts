// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareEditorVectorDefinition } from '../../objects/vector-elements/prepare';
import { beginEditorVectorPlacement } from './placement';

function pointer(type: string, x: number, y: number) {
  const event = new MouseEvent(type, {
    clientX: x,
    clientY: y,
    button: 0,
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  return event;
}
afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});
async function fixture() {
  const definition = await prepareEditorVectorDefinition(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h10v10z"/></svg>',
    {
      sourceId: 'local',
      prefix: null,
      name: null,
      author: null,
      authorUrl: null,
      license: null,
      licenseUrl: null,
    }
  );
  const boundary = document.createElement('div');
  document.body.append(boundary);
  vi.spyOn(boundary, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 80, 400, 300));
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: vi.fn(() => boundary),
  });
  const canvas = {
    getScenePoint: vi.fn((event: MouseEvent) => ({
      x: (event.clientX - 100) / 2,
      y: (event.clientY - 80) / 2,
    })),
  };
  const controller = {
    canvas,
    source: {},
    layerMutationToken: 1,
    insertVectorElement: vi.fn(async () => true),
  };
  const onGhost = vi.fn(),
    onInserted = vi.fn(),
    onFailure = vi.fn();
  return {
    definition,
    boundary,
    canvas,
    controller,
    onGhost,
    onInserted,
    onFailure,
    start: () =>
      beginEditorVectorPlacement({
        event: { button: 0, pointerId: 1, clientX: 20, clientY: 20 },
        definition,
        controller,
        boundary,
        onGhost,
        onInserted,
        onFailure,
      }),
  };
}

describe('prepared vector placement', () => {
  it('inserts once at the exact scene point after release inside the document', async () => {
    const f = await fixture();
    const cancel = f.start();
    document.dispatchEvent(pointer('pointermove', 240, 180));
    document.dispatchEvent(pointer('pointerup', 240, 180));
    await Promise.resolve();
    expect(f.controller.insertVectorElement).toHaveBeenCalledExactlyOnceWith(
      f.definition,
      {
        x: 70,
        y: 50,
      },
      expect.any(Object),
      expect.objectContaining({ opacity: 1, strokeScale: 1 })
    );
    expect(f.onInserted).toHaveBeenCalledOnce();
    expect(f.onGhost).toHaveBeenLastCalledWith(null);
    document.dispatchEvent(pointer('pointerup', 260, 190));
    expect(f.controller.insertVectorElement).toHaveBeenCalledOnce();
    cancel();
  });
  it.each(['escape', 'blur', 'pointercancel', 'outside', 'stale', 'ui', 'click'])(
    'does not insert on %s cancellation',
    async (mode) => {
      const f = await fixture();
      f.start();
      if (mode !== 'click') document.dispatchEvent(pointer('pointermove', 240, 180));
      if (mode === 'escape')
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      if (mode === 'blur') window.dispatchEvent(new Event('blur'));
      if (mode === 'pointercancel') document.dispatchEvent(pointer('pointercancel', 240, 180));
      if (mode === 'stale') f.controller.source = {};
      if (mode === 'ui') {
        const ui = document.createElement('div');
        ui.dataset['ui'] = 'editor.floating.layers-panel';
        document.body.append(ui);
        Object.defineProperty(document, 'elementFromPoint', {
          value: () => ui,
          configurable: true,
        });
      }
      document.dispatchEvent(pointer('pointerup', mode === 'outside' ? 600 : 240, 180));
      await Promise.resolve();
      expect(f.controller.insertVectorElement).not.toHaveBeenCalled();
    }
  );
});
