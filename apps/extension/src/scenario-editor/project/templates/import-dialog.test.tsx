// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScenarioTextElement } from '../../../features/scenario/project/v3';
import {
  SCENARIO_TEMPLATE_IMPORT_VALIDATION_DELAY_MS,
  SCENARIO_V3_LIMITS,
} from '../../../features/scenario/project/v3/limits';
import { translate } from '../../../platform/i18n';
import { ScenarioTemplateImportDialog } from './import-dialog';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createPackText() {
  return JSON.stringify({
    library: { name: 'Team templates' },
    templates: [
      {
        catalogRank: 0,
        catalogStatus: 'core',
        description: 'Team title',
        group: 'team',
        label: 'Team title',
        slide: {
          canvas: { background: { color: '#fff', kind: 'solid' }, height: 720, width: 1280 },
          elements: [createScenarioTextElement({ role: 'title', text: 'Team' })],
          notes: '',
          title: 'Team title',
        },
        source: 'imported',
        templateId: 'team-title',
        version: 1,
      },
      {
        html: '<script>alert(1)</script>',
        templateId: 'unsafe',
      },
    ],
    version: 1,
  });
}

function renderDialog() {
  const onClose = vi.fn();
  const onSaveLibrary = vi.fn();

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(<ScenarioTemplateImportDialog onClose={onClose} onSaveLibrary={onSaveLibrary} />);
  });

  return { onClose, onSaveLibrary };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('scenario template import dialog', () => {
  it('validates pasted packs and saves accepted templates only', verifyAcceptedTemplateImport);
  it('surfaces invalid JSON and supports closing the dialog', verifyInvalidJsonClose);
  it('rejects oversized pasted packs before parsing JSON', verifyOversizedPasteRejectedBeforeParse);
  it(
    'disables saving stale accepted templates while new text is pending',
    verifyStaleResultCleared
  );
});

function pasteImportText(value: string): void {
  const textarea = container?.querySelector<HTMLTextAreaElement>('textarea');

  act(() => {
    if (!textarea) {
      throw new Error('Expected import textarea');
    }
    setNativeTextareaValue(textarea, value);
    textarea.dispatchEvent(new InputEvent('input', { bubbles: true }));
  });
}

function clickPrimaryImportAction(): void {
  act(() => {
    container?.querySelector<HTMLButtonElement>('button:not([aria-label])')?.click();
  });
}

async function verifyAcceptedTemplateImport(): Promise<void> {
  const { onSaveLibrary } = renderDialog();

  pasteImportText(createPackText());
  await flushImportValidation();
  clickPrimaryImportAction();

  expect(container?.textContent).toContain(translate('scenario.editor.templatesAccepted'));
  expect(container?.textContent).toContain(translate('scenario.editor.rejectedTemplates'));
  expect(onSaveLibrary).toHaveBeenCalledWith(
    expect.objectContaining({
      enabled: true,
      name: 'Team templates',
      templates: [expect.objectContaining({ templateId: 'team-title' })],
    })
  );
}

async function verifyInvalidJsonClose(): Promise<void> {
  const { onClose, onSaveLibrary } = renderDialog();

  pasteImportText('{not-json');
  await flushImportValidation();
  act(() => {
    container
      ?.querySelector<HTMLButtonElement>(
        `[aria-label="${translate('scenario.editor.templateManagerClose')}"]`
      )
      ?.click();
  });

  expect(container?.textContent).toContain(translate('scenario.editor.invalidTemplateJson'));
  expect(onSaveLibrary).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalledTimes(1);
}

async function verifyOversizedPasteRejectedBeforeParse(): Promise<void> {
  const parseSpy = vi.spyOn(JSON, 'parse');

  renderDialog();
  pasteImportText('x'.repeat(SCENARIO_V3_LIMITS.maxPackJsonLength + 1));
  await flushImportValidation();

  expect(container?.textContent).toContain(translate('scenario.editor.invalidTemplateJson'));
  expect(parseSpy).not.toHaveBeenCalled();
  parseSpy.mockRestore();
}

async function verifyStaleResultCleared(): Promise<void> {
  const { onSaveLibrary } = renderDialog();

  pasteImportText(createPackText());
  await flushImportValidation();
  pasteImportText('{not-json');
  clickPrimaryImportAction();

  expect(onSaveLibrary).not.toHaveBeenCalled();
  await flushImportValidation();
  expect(container?.textContent).toContain(translate('scenario.editor.invalidTemplateJson'));
}

async function flushImportValidation(): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(SCENARIO_TEMPLATE_IMPORT_VALIDATION_DELAY_MS);
    await Promise.resolve();
  });
}

function setNativeTextareaValue(field: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(field, value);
}
