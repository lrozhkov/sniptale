// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../features/scenario/capture-metadata-dialog/index', () => ({
  ScenarioCaptureMetadataDialog: (props: { stepTitle?: string }) => (
    <div data-testid="metadata-preview">{props.stepTitle}</div>
  ),
}));

import { buildScenarioCaptureMetadataDialogPreviews } from './design-system';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe('buildScenarioCaptureMetadataDialogPreviews', () => {
  it('builds the canonical metadata dialog preview', () => {
    const previews = buildScenarioCaptureMetadataDialogPreviews('ru');

    act(() => {
      root?.render(previews[0]!.preview);
    });

    expect(previews).toHaveLength(1);
    expect(previews[0]).toEqual(
      expect.objectContaining({
        componentId: 'shared.ui.scenario-capture-metadata-dialog',
        variantId: 'default',
        previewId: 'shared.ui.scenario-capture-metadata-dialog.default',
      })
    );
    expect(container?.querySelector('[data-ui="design-system.preview-frame"]')).not.toBeNull();
    expect(container?.textContent).toContain('Опубликовать релиз');
  });
});
