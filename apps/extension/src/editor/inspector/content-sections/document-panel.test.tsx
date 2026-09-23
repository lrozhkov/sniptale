// @vitest-environment jsdom
import type { ComponentProps } from 'react';
import { expect, it, vi } from 'vitest';
import { normalizeBrowserFrameState } from '../../../features/editor/document/constants';
import {
  createControllerMock,
  renderWithController,
} from '../../../../../../tooling/test/harness/editor/ownership/helpers';
import { EditorInspectorDocumentPanel, type DocumentInspectorMode } from './document-panel';

const modes: DocumentInspectorMode[] = ['browser-frame', 'meta', 'image-size', 'canvas-size'];

it.each(modes)('shows only the selected %s category', (inspector) => {
  const props: ComponentProps<typeof EditorInspectorDocumentPanel> = {
    inspector,
    browserFrame: normalizeBrowserFrameState({ title: 'Page title' }),
    browserCanvasModeOptions: [{ value: 'resize', label: 'Resize' }],
    browserContentModeOptions: [{ value: 'push-down', label: 'Push down' }],
    syncBrowserFrame: vi.fn(),
    imageSizeText: '320 × 180',
    canvasSizeText: '320 × 180',
    canvasSize: { width: 320, height: 180 },
    cropReady: false,
    cropSelection: null,
    imageSizeDraft: { width: 320, height: 180 },
    canvasSizeDraft: { width: 320, height: 180 },
    imageSizeLocked: false,
    canvasSizeLocked: false,
    imageAspectRatio: null,
    canvasAspectRatio: null,
    setImageSizeDraft: vi.fn(),
    setCanvasSizeDraft: vi.fn(),
    setImageSizeLocked: vi.fn(),
    setCanvasSizeLocked: vi.fn(),
    updateLockedDraft: (state) => state,
  };
  renderWithController(<EditorInspectorDocumentPanel {...props} />, createControllerMock());
  expect(document.querySelector(`[data-section="${inspector}"]`)).not.toBeNull();
  for (const other of modes.filter((mode) => mode !== inspector)) {
    expect(document.querySelector(`[data-section="${other}"]`)).toBeNull();
  }
  expect(document.querySelectorAll('[data-ui="editor.inspector.section-heading"]')).toHaveLength(1);
});
