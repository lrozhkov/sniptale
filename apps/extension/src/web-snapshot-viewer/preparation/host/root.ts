import { CONTENT_ROOT_ID } from '@sniptale/ui/branding';
import { initializeContentUiRoots } from '../../../content/public/preparation-surface/ui-roots/surfaces';
import {
  createShadowHost,
  createShadowRootWithStyles,
} from '@sniptale/platform/browser/shadow-dom';
import { initializeAppTheme } from '../../../ui/theme';
import { createPreparationSurfaceStyles } from '../../../content/public/preparation-surface';

export type ViewerPreparationRoot = {
  appContainer: HTMLDivElement;
  host: HTMLElement;
  ownsHost: boolean;
};

function resolveOrCreateHost(): { host: HTMLElement; ownsHost: boolean } {
  const existingHost = document.getElementById(CONTENT_ROOT_ID);
  if (existingHost) {
    return { host: existingHost, ownsHost: false };
  }

  return { host: createShadowHost(CONTENT_ROOT_ID), ownsHost: true };
}

function resolveOrCreateShadowRoot(host: HTMLElement): ShadowRoot {
  return host.shadowRoot ?? createShadowRootWithStyles(host, createPreparationSurfaceStyles());
}

export function createViewerPreparationRoot(): ViewerPreparationRoot {
  const { host, ownsHost } = resolveOrCreateHost();
  initializeAppTheme('system', host, { applyColorSchemeInline: false });

  const shadow = resolveOrCreateShadowRoot(host);
  const { appContainer } = initializeContentUiRoots(shadow);

  if (!host.isConnected) {
    document.body.appendChild(host);
  }

  return { appContainer, host, ownsHost };
}

export function disposeViewerPreparationRoot(root: ViewerPreparationRoot): void {
  if (root.ownsHost) {
    root.host.remove();
  }
}
