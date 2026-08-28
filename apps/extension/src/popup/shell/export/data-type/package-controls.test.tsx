// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  PackageDestinationSwitch,
  PackagePresetControls,
  WebCopyPackageCard,
} from './package-controls';

vi.mock('../../../../platform/i18n/popup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n/popup')>()),
  translate: (key: string) => key,
}));

let container: HTMLDivElement;
let root: Root;

function createPreferences(includeWebCopy = false) {
  return {
    actions: {
      setIncludeAnnotations: vi.fn(),
      setIncludeBasicLogs: vi.fn(),
      setIncludeCssDiagnostics: vi.fn(),
      setIncludeFiles: vi.fn(),
      setIncludeFullPageScreenshot: vi.fn(),
      setIncludePageDiagnostics: vi.fn(),
      setIncludeImages: vi.fn(),
      setIncludeJson: vi.fn(),
      setIncludeMarkdown: vi.fn(),
    },
    includeWebCopy,
    setIncludeWebCopy: vi.fn(),
    values: {
      includeAnnotations: false,
      includeBasicLogs: false,
      includeCssDiagnostics: false,
      includeFiles: false,
      includeFullPageScreenshot: false,
      includePageDiagnostics: false,
      includeImages: false,
      includeJson: false,
      includeMarkdown: false,
    },
  };
}

async function render(node: React.ReactNode) {
  await act(async () => root.render(node));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('switches the editor destination without mutating either selection', async () => {
  const onChange = vi.fn();
  await render(
    <PackageDestinationSwitch destination="export" disabled={false} onChange={onChange} />
  );

  const libraryButton = [...container.querySelectorAll('button')].find((button) =>
    button.textContent?.includes('packageDestinationLibrary')
  );
  await act(async () => libraryButton?.click());

  expect(onChange).toHaveBeenCalledWith('save');
});

it('routes disabled Web copy to setup and still allows an enabled selection to be removed', async () => {
  const inactive = createPreferences(false);
  const onRequestSetup = vi.fn();
  await render(
    <WebCopyPackageCard
      destination="export"
      disabled={false}
      onRequestSetup={onRequestSetup}
      preferences={inactive}
      webSnapshotEnabled={false}
    />
  );
  await act(async () => container.querySelector('button')?.click());
  expect(onRequestSetup).toHaveBeenCalledOnce();
  expect(inactive.setIncludeWebCopy).not.toHaveBeenCalled();

  const active = createPreferences(true);
  await render(
    <WebCopyPackageCard
      destination="export"
      disabled={false}
      onRequestSetup={onRequestSetup}
      preferences={active}
      webSnapshotEnabled={false}
    />
  );
  await act(async () => container.querySelector('button')?.click());
  expect(active.setIncludeWebCopy).toHaveBeenCalledWith(false);
});

it('keeps Library Web copy mandatory and opens setup while the feature is off', async () => {
  const preferences = createPreferences(true);
  const onRequestSetup = vi.fn();
  await render(
    <WebCopyPackageCard
      destination="save"
      disabled={false}
      onRequestSetup={onRequestSetup}
      preferences={preferences}
      webSnapshotEnabled={false}
    />
  );
  await act(async () => container.querySelector('button')?.click());

  expect(onRequestSetup).toHaveBeenCalledOnce();
  expect(preferences.setIncludeWebCopy).not.toHaveBeenCalled();
});

it('projects presets onto the existing booleans without storing a preset authority', async () => {
  const preferences = createPreferences(false);
  await render(
    <PackagePresetControls
      destination="export"
      disabled={false}
      onRequestSetup={vi.fn()}
      preferences={preferences}
      webSnapshotEnabled={true}
    />
  );
  const fullButton = [...container.querySelectorAll('button')].find((button) =>
    button.textContent?.includes('packagePresetFull')
  );
  await act(async () => fullButton?.click());

  expect(preferences.setIncludeWebCopy).toHaveBeenCalledWith(true);
  expect(preferences.actions.setIncludeJson).toHaveBeenCalledWith(true);
  expect(preferences.actions.setIncludeFullPageScreenshot).toHaveBeenCalledWith(true);
});

it('does not enable a Web-copy preset while the feature is off', async () => {
  const preferences = createPreferences(false);
  const onRequestSetup = vi.fn();
  await render(
    <PackagePresetControls
      destination="export"
      disabled={false}
      onRequestSetup={onRequestSetup}
      preferences={preferences}
      webSnapshotEnabled={false}
    />
  );
  const webCopyButton = [...container.querySelectorAll('button')].find((button) =>
    button.textContent?.includes('packagePresetWebCopy')
  );
  await act(async () => webCopyButton?.click());

  expect(onRequestSetup).toHaveBeenCalledOnce();
  expect(preferences.setIncludeWebCopy).not.toHaveBeenCalled();
});

it('keeps the Web-copy screenshot selected for every Library preset', async () => {
  const preferences = createPreferences(true);
  await render(
    <PackagePresetControls
      destination="save"
      disabled={false}
      onRequestSetup={vi.fn()}
      preferences={preferences}
      webSnapshotEnabled={true}
    />
  );
  const webCopyButton = [...container.querySelectorAll('button')].find((button) =>
    button.textContent?.includes('packagePresetWebCopy')
  );
  await act(async () => webCopyButton?.click());

  expect(preferences.actions.setIncludeFullPageScreenshot).toHaveBeenLastCalledWith(true);
  expect(preferences.actions.setIncludePageDiagnostics).toHaveBeenLastCalledWith(false);
});
