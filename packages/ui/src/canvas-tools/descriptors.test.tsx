// @vitest-environment jsdom

import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CanvasInsertToolPanel } from './index';
import {
  createCanvasFileInsertToolAction,
  createCanvasFileToolAction,
  createCanvasInsertToolAction,
  createCanvasToolAction,
  type CanvasToolDescriptorKind,
} from './descriptors';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('creates semantic canvas actions with shared icons for editor adapters', () => {
  const actions = DESCRIPTOR_KINDS.map((kind) =>
    createCanvasToolAction({
      group: 'primary',
      id: kind,
      kind,
      label: kind,
      onSelect: vi.fn(),
    })
  );
  const markup = renderToStaticMarkup(
    <CanvasInsertToolPanel actions={actions} dataUi="shared.canvas.insert" label="Insert" />
  );

  for (const kind of DESCRIPTOR_KINDS) {
    expect(markup).toContain(`data-ui="shared.canvas.insert.${kind}"`);
  }
});

it('preserves file accept metadata and routes selected files through shared buttons', () => {
  const onSelectFile = vi.fn();
  render(
    <CanvasInsertToolPanel
      actions={[
        createCanvasFileToolAction({
          accept: 'image/*',
          group: 'secondary',
          id: 'image',
          kind: 'image',
          label: 'Image',
          onSelectFile,
        }),
      ]}
      dataUi="shared.canvas.insert"
      label="Insert"
    />
  );

  const button = container?.querySelector<HTMLButtonElement>(
    '[data-ui="shared.canvas.insert.image"]'
  );
  const input = container?.querySelector<HTMLInputElement>('input[accept="image/*"]');

  expect(button).not.toBeNull();
  expect(input).not.toBeNull();
  act(() => button?.click());
  act(() => {
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [new File(['image'], 'image.png', { type: 'image/png' })],
    });
    input?.dispatchEvent(new Event('change', { bubbles: true }));
  });

  expect(input?.getAttribute('accept')).toBe('image/*');
  expect(onSelectFile).toHaveBeenCalledWith(expect.any(File));
});

it('creates insert actions from shared canvas intents and routes clicks through adapters', () => {
  const onSelect = vi.fn();
  const textIntent = { kind: 'text' as const, placement: 'canvas-point' as const, target: 'text' };
  render(
    <CanvasInsertToolPanel
      actions={[
        createCanvasInsertToolAction({
          active: true,
          group: 'primary',
          intent: textIntent,
          label: 'Text',
          onSelect,
        }),
      ]}
      dataUi="shared.canvas.insert"
      label="Insert"
    />
  );

  act(() => {
    container?.querySelector<HTMLButtonElement>('[data-ui="shared.canvas.insert.text"]')?.click();
  });

  expect(onSelect).toHaveBeenCalledWith(textIntent);
});

it('creates file insert actions from shared canvas intents', () => {
  const onSelectFile = vi.fn();
  render(
    <CanvasInsertToolPanel
      actions={[
        createCanvasFileInsertToolAction({
          accept: 'video/*',
          group: 'secondary',
          intent: { kind: 'video', placement: 'file', target: 'video' },
          label: 'Video',
          onSelectFile,
        }),
      ]}
      dataUi="shared.canvas.insert"
      label="Insert"
    />
  );

  const input = container?.querySelector<HTMLInputElement>('input[accept="video/*"]');
  act(() => {
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [new File(['video'], 'clip.mp4', { type: 'video/mp4' })],
    });
    input?.dispatchEvent(new Event('change', { bubbles: true }));
  });

  expect(onSelectFile).toHaveBeenCalledWith(expect.any(File));
});

function render(node: ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(node));
}

const DESCRIPTOR_KINDS = [
  'add-slide',
  'annotation',
  'arrow',
  'audio',
  'blur',
  'brush',
  'callout',
  'code',
  'diamond',
  'ellipse',
  'eraser',
  'fill',
  'grid',
  'highlighter',
  'image',
  'inspector-collapse',
  'inspector-expand',
  'layout',
  'line',
  'magnet',
  'pencil',
  'rectangle',
  'record-audio',
  'rough-shape',
  'scene',
  'select',
  'selection',
  'shape',
  'shape-library',
  'shapes-and-lines',
  'step',
  'text',
  'video',
  'workspace',
] as const satisfies readonly CanvasToolDescriptorKind[];
