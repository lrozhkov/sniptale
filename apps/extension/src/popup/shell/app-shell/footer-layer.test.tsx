// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const footerLayerMocks = vi.hoisted(() => ({
  popupFooterMock: vi.fn(
    (props: {
      onOpenDesignSystem: () => void;
      onOpenGithub: () => void;
      onOpenSettings: () => void;
      showAppliedStylesAction: boolean;
      showRestrictionIndicator: boolean;
      restrictionIndicatorTitle: string | null;
    }) => (
      <div
        data-ui="popup.footer"
        data-applied-styles-action={String(props.showAppliedStylesAction)}
        data-restriction-indicator={String(props.showRestrictionIndicator)}
        data-restriction-title={props.restrictionIndicatorTitle ?? ''}
      />
    )
  ),
  openAppliedStylesMock: vi.fn(),
  showAppliedStylesAction: false,
}));

vi.mock('../navigation/actions', () => ({
  DynamicIcon: () => null,
  IDLE_RECORDING_STATE: {},
  PopupPage: undefined,
  describeCaptureSource: vi.fn(),
  formatDuration: vi.fn(),
  formatHotkeyShort: vi.fn(),
  getCaptureModeLabels: vi.fn(),
  getQuickActionColor: vi.fn(),
  getQuickActionMeta: vi.fn(),
  getRecordingStatusLabel: vi.fn(),
  getViewportPresetLabel: vi.fn(),
  openDesignSystem: vi.fn(),
  openGallery: vi.fn(),
  openGithubRepository: vi.fn(),
  openImageEditor: vi.fn(),
  openScenarioEditor: vi.fn(),
  openScreenshotMode: vi.fn(),
  openSettings: vi.fn(),
  openVideoEditor: vi.fn(),
  triggerQuickAction: vi.fn(),
}));

vi.mock('./applied-styles-entrypoint', () => ({
  useAppliedPageStylesEntrypoint: () => ({
    handleOpenAppliedStyles: footerLayerMocks.openAppliedStylesMock,
    showAppliedStylesAction: footerLayerMocks.showAppliedStylesAction,
  }),
}));

vi.mock('../footer', () => ({
  default: (props: Parameters<typeof footerLayerMocks.popupFooterMock>[0]) =>
    footerLayerMocks.popupFooterMock(props),
}));

import { FooterLayer } from './footer-layer';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderFooterLayer() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<FooterLayer />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  footerLayerMocks.popupFooterMock.mockClear();
  footerLayerMocks.openAppliedStylesMock.mockClear();
  footerLayerMocks.showAppliedStylesAction = false;
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

describe('FooterLayer', () => {
  it('passes the restricted-page footer indicator through to the footer', () => {
    const markup = renderToStaticMarkup(<FooterLayer />);

    expect(markup).toContain('popup.footer');
    expect(markup).toContain('data-applied-styles-action="false"');
    expect(markup).toContain('data-restriction-indicator="false"');
    expect(markup).toContain('data-restriction-title=""');
    expect(footerLayerMocks.popupFooterMock).toHaveBeenCalledTimes(1);
  });

  it('passes the applied page styles entrypoint state to the lazy footer', () => {
    footerLayerMocks.showAppliedStylesAction = true;

    const markup = renderToStaticMarkup(<FooterLayer />);

    expect(markup).toContain('data-applied-styles-action="true"');
  });

  it('omits the restriction indicator on unrestricted pages', () => {
    const markup = renderToStaticMarkup(<FooterLayer />);

    expect(markup).toContain('popup.footer');
    expect(markup).toContain('data-restriction-indicator="false"');
    expect(markup).toContain('data-restriction-title=""');
  });

  it('renders the footer synchronously without a loading fallback', async () => {
    await renderFooterLayer();

    expect(container?.querySelector('[data-ui="popup.footer"]')).not.toBeNull();
    expect(container?.querySelector('[data-ui="popup.footer.fallback"]')).toBeNull();
    expect(footerLayerMocks.popupFooterMock).toHaveBeenCalledTimes(1);
  });
});
