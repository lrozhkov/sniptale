// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ScenarioCaptureMetadataDialog } from './index';

vi.mock('../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

vi.mock('@sniptale/ui/product-modal', () => ({
  ProductModal: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
  ProductModalBody: (props: { children: React.ReactNode; className?: string }) => (
    <div data-class={props.className}>{props.children}</div>
  ),
  ProductModalHeader: (props: { title: string }) => <div>{props.title}</div>,
}));

const view = {
  captureMetadata: {
    pointerRange: null,
    scroll: null,
    trigger: 'pointer-up' as const,
  },
  captureSurface: 'visible' as const,
  cursorPoint: null,
  interactionPoint: null,
  page: {
    title: null,
    url: null,
    viewport: { x: 0, y: 0, width: 1280, height: 720 },
    scrollX: 0,
    scrollY: 0,
    devicePixelRatio: 1,
  },
  sourceKind: 'manual' as const,
  target: null,
};

describe('ScenarioCaptureMetadataDialog facade', () => {
  it('keeps the root owner thin while wiring modal shell and sections', () => {
    const markup = renderToStaticMarkup(
      <ScenarioCaptureMetadataDialog onClose={() => undefined} view={view} />
    );

    expect(markup).toContain('scenario.common.metadata.title');
    expect(markup).toContain('data-class="grid gap-3"');
    expect(markup).toContain('scenario.common.metadata.groups.capture');
    expect(markup).toContain('scenario.common.metadata.values.surfaceVisible');
  });
});
