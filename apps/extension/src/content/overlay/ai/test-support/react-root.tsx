import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

export type RenderedReactTestNode = {
  container: HTMLDivElement;
  root: Root;
};

export function enableReactActEnvironment(): void {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
}

export async function renderIntoTestContainer(
  node: React.ReactNode
): Promise<RenderedReactTestNode> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(node);
  });

  return {
    container,
    root,
  };
}

export function cleanupRenderedNode(rendered: RenderedReactTestNode | null): void {
  if (!rendered) {
    return;
  }

  act(() => {
    rendered.root.unmount();
  });
  rendered.container.remove();
}
