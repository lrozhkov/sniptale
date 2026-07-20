// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { contentPropsSpy, useEditorSectionSpy } = vi.hoisted(() => ({
  contentPropsSpy: vi.fn(),
  useEditorSectionSpy: vi.fn(),
}));

vi.mock('./content', () => ({
  EditorSectionContent: (props: unknown) => {
    contentPropsSpy(props);
    return <div data-testid="editor-section-content" />;
  },
}));

vi.mock('./controller', () => ({
  useEditorSection: () => useEditorSectionSpy(),
}));

import { EditorSection } from '.';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderSection() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<EditorSection />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  contentPropsSpy.mockReset();
  useEditorSectionSpy.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('forwards editor section state into the content shell', async () => {
  const sectionState = { presetOwner: 'pencil' };
  useEditorSectionSpy.mockReturnValue(sectionState);

  await renderSection();

  expect(contentPropsSpy).toHaveBeenCalledWith({ state: sectionState });
  expect(container?.querySelector('[data-testid="editor-section-content"]')).not.toBeNull();
});
