import { expect, it, vi } from 'vitest';
import type { EditorControllerInstance } from '../instance/types';

const mocks = vi.hoisted(() => ({
  createBindings: vi.fn((controller: EditorControllerInstance) => ({ controller })),
  createHandlers: vi.fn(() => ({ identity: Symbol('event-handlers') })),
}));

vi.mock('../instance/bindings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../instance/bindings')>()),
  createEditorControllerEventBindings: mocks.createBindings,
}));

vi.mock('../events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../events')>()),
  createEditorControllerEventHandlers: mocks.createHandlers,
}));

import { ImageEditorController } from './root';

it('initializes instance-owned event handlers without calling an override during construction', () => {
  const initializedControllers = new WeakSet<object>();

  class DerivedController extends ImageEditorController {
    constructor() {
      super();
      initializedControllers.add(this);
    }

    protected override getControllerInstance(): EditorControllerInstance {
      if (!initializedControllers.has(this)) {
        throw new Error('controller override called before derived construction completed');
      }
      return super.getControllerInstance();
    }
  }

  expect(() => new DerivedController()).not.toThrow();

  const first = new ImageEditorController();
  const second = new ImageEditorController();

  expect(mocks.createBindings).toHaveBeenCalledWith(first);
  expect(mocks.createBindings).toHaveBeenCalledWith(second);
  expect(first.eventHandlers).not.toBe(second.eventHandlers);
});
