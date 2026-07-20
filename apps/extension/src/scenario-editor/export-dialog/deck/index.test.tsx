// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScenarioProjectV3 } from '../../../features/scenario/project/v3';
import type {
  ScenarioDeckExportOptions,
  ScenarioDeckExportResult,
} from '../../project/export/deck/types';
import { ScenarioDeckExportDialog } from './index';

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

describe('ScenarioDeckExportDialog', () => {
  it('exports with default HTML options exposed through UI controls', verifyDefaultHtmlOptions);
  it('lets the user toggle every API option without editing JSON', verifyToggledApiOptions);
  it('surfaces export errors and missing asset diagnostics', verifyExportDiagnostics);
});

async function verifyDefaultHtmlOptions(): Promise<void> {
  const onExport = vi.fn(async () => createExportResult());
  renderDialog(onExport);

  expect(findButtonByText('HTML deck')?.getAttribute('aria-pressed')).toBe('true');
  expect(findButtonByText('Embed images')?.getAttribute('aria-pressed')).toBe('true');
  expect(
    container?.querySelectorAll('[data-ui="shared.ui.compact-inspector.segmented-field"]')
  ).toHaveLength(2);

  await clickButtonText('Export');

  expect(onExport).toHaveBeenCalledWith({
    assetMode: 'embed',
    format: 'html',
    includeMissingPlaceholders: true,
    includeNotes: true,
    includeSourceJson: false,
  });
  expect(container?.textContent).toContain('Export created.');
}

async function verifyToggledApiOptions(): Promise<void> {
  const onExport = vi.fn(async () => createExportResult());
  renderDialog(onExport);

  await clickButton('Markdown bundle');
  await clickButton('Include speaker notes');
  await clickButton('Show missing asset placeholders');
  await clickButton('Include slide source JSON');
  await clickButtonText('Export');

  expect(onExport).toHaveBeenCalledWith({
    assetMode: 'files',
    format: 'markdown',
    includeMissingPlaceholders: false,
    includeNotes: false,
    includeSourceJson: true,
  });
}

async function verifyExportDiagnostics(): Promise<void> {
  const onExport = vi
    .fn()
    .mockRejectedValueOnce('unknown failure')
    .mockRejectedValueOnce(new Error('Asset backend unavailable'))
    .mockResolvedValueOnce(createExportResult(['asset-1']));
  renderDialog(onExport);

  await clickButtonText('Export');
  expect(container?.textContent).toContain('Export failed');

  await clickButtonText('Export');
  expect(container?.textContent).toContain('Asset backend unavailable');

  await clickButtonText('Export');
  expect(container?.textContent).toContain('Exported with missing assets: asset-1');
}

function renderDialog(
  onExport: (options: ScenarioDeckExportOptions) => Promise<ScenarioDeckExportResult>
) {
  act(() => {
    root?.render(
      <ScenarioDeckExportDialog
        onClose={vi.fn()}
        onExport={onExport}
        project={createScenarioProjectV3('Demo deck')}
      />
    );
  });
}

function findButtonByText(text: string) {
  return Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []).find(
    (candidate) => candidate.textContent?.trim() === text
  );
}

async function clickButton(label: string) {
  const button =
    container?.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`) ??
    findButtonByText(label);
  expect(button).not.toBeNull();
  await act(async () => {
    button?.click();
  });
}

async function clickButtonText(text: string) {
  const button = findButtonByText(text);
  expect(button).not.toBeNull();
  await act(async () => {
    button?.click();
  });
}

function createExportResult(missingAssetIds: string[] = []): ScenarioDeckExportResult {
  return {
    blob: new Blob(['export']),
    filename: 'deck.html',
    format: 'html',
    missingAssetIds,
  };
}
