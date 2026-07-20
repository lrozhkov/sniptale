// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { EditorEmbedProvider, useEditorEmbedContext } from './context';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderNode(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(node));
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

it('returns the default non-embed value without a provider', () => {
  let mode: ReturnType<typeof useEditorEmbedContext>['mode'] | undefined;

  function Probe() {
    mode = useEditorEmbedContext().mode;
    return null;
  }

  renderNode(<Probe />);

  expect(mode).toBeNull();
});

it('shares scenario embed callbacks through the provider', () => {
  const onApply = vi.fn(async () => undefined);
  const onClose = vi.fn();
  const seen: { embed?: ReturnType<typeof useEditorEmbedContext> } = {};

  function Probe() {
    seen.embed = useEditorEmbedContext();
    return null;
  }

  renderNode(
    <EditorEmbedProvider mode="scenario" onApply={onApply} onClose={onClose}>
      <Probe />
    </EditorEmbedProvider>
  );

  expect(seen.embed?.mode).toBe('scenario');
  expect(seen.embed?.onApply).toBe(onApply);
  expect(seen.embed?.onClose).toBe(onClose);
});
