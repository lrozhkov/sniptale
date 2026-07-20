// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createScenarioProjectV3 } from '../../../features/scenario/project/v3';
import type { ScenarioDeckExportResult } from '../../project/export/deck/types';
import { ScenarioDeckExportPanel } from './panel';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('renders embedded export controls as compact inspector rows and exports current options', async () => {
  const onExport = vi.fn(async () => createExportResult());

  act(() => {
    root?.render(
      <ScenarioDeckExportPanel
        onExport={onExport}
        project={createScenarioProjectV3('Embedded deck')}
      />
    );
  });

  expect(container?.querySelector('[data-ui="scenario.deck-export.panel"]')).not.toBeNull();
  expect(
    container?.querySelectorAll('[data-ui="shared.ui.compact-inspector.segmented-field"]')
  ).toHaveLength(2);
  expect(findButtonByText('HTML deck')?.getAttribute('aria-pressed')).toBe('true');

  await clickButton('Markdown bundle');
  await clickButton('Include speaker notes');
  await clickButton('Export');

  expect(onExport).toHaveBeenCalledWith({
    assetMode: 'files',
    format: 'markdown',
    includeMissingPlaceholders: true,
    includeNotes: false,
    includeSourceJson: false,
  });
});

function findButtonByText(text: string) {
  return Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []).find(
    (button) => button.textContent?.trim() === text
  );
}

async function clickButton(text: string) {
  const button =
    container?.querySelector<HTMLButtonElement>(`button[aria-label="${text}"]`) ??
    findButtonByText(text);
  expect(button).toBeDefined();
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
