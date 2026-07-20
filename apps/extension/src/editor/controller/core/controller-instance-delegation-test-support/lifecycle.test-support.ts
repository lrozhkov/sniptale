import { vi } from 'vitest';

const lifecycleMocks = vi.hoisted(() => ({
  clearSelectionForController: vi.fn(),
  closeDocumentForController: vi.fn(),
  copyRenderedImageForController: vi.fn(async () => undefined),
  disposeEditorController: vi.fn(),
  exportDocumentForController: vi.fn(() => ({ version: 1 })),
  loadDocumentForController: vi.fn(async () => undefined),
  mountEditorController: vi.fn(),
  openImageForController: vi.fn(async () => undefined),
  renderToDataUrlForController: vi.fn(() => 'data:image/png;base64,rendered'),
  setActiveToolForController: vi.fn(),
  suspendToolModeForController: vi.fn(),
}));

const documentCommandService = vi.hoisted(() => ({
  closeDocument: lifecycleMocks.closeDocumentForController,
  copyRenderedImage: lifecycleMocks.copyRenderedImageForController,
  exportDocument: lifecycleMocks.exportDocumentForController,
  loadDocument: lifecycleMocks.loadDocumentForController,
  openImage: lifecycleMocks.openImageForController,
  renderToDataUrl: lifecycleMocks.renderToDataUrlForController,
}));

export function getLifecycleMocks() {
  return lifecycleMocks;
}

vi.mock('../../document-commands', () => ({
  createEditorDocumentCommandService: vi.fn(() => documentCommandService),
}));

vi.mock('../../instance/actions/lifecycle/dispose', () => ({
  disposeEditorController: lifecycleMocks.disposeEditorController,
}));

vi.mock('../../instance/actions/lifecycle/mount', () => ({
  mountEditorController: lifecycleMocks.mountEditorController,
}));

vi.mock('../../instance/actions/lifecycle/tool-mode', () => ({
  clearSelectionForController: lifecycleMocks.clearSelectionForController,
  setActiveToolForController: lifecycleMocks.setActiveToolForController,
  suspendToolModeForController: lifecycleMocks.suspendToolModeForController,
}));
