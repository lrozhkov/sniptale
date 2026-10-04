// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EditorTechnicalDataPicker } from './technical-data-picker';
import { useEditorStore } from '../state/useEditorStore';

const { loadPreferenceMock, savePreferenceMock } = vi.hoisted(() => ({
  loadPreferenceMock: vi.fn(),
  savePreferenceMock: vi.fn(),
}));

const disclosureValues = vi.hoisted(() => ({}) as Record<string, unknown>);

vi.mock('../../composition/persistence/inspector-disclosures/store', async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import('../../composition/persistence/inspector-disclosures/store')
    >();
  return {
    ...original,
    createInspectorDisclosureStore: () =>
      original.createInspectorDisclosureStore({
        get: async () => disclosureValues,
        set: async (next) => {
          Object.assign(disclosureValues, next);
        },
      }),
  };
});

vi.mock('../persistence/ui-state/technical-data', () => ({
  loadEditorTechnicalDataPreference: loadPreferenceMock,
  saveEditorTechnicalDataPreference: savePreferenceMock,
}));

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));

const container = document.createElement('div');
document.body.appendChild(container);
const root = createRoot(container);

beforeEach(() => {
  for (const key of Object.keys(disclosureValues)) delete disclosureValues[key];
  loadPreferenceMock.mockResolvedValue({ kinds: [], layout: 'column' });
  savePreferenceMock.mockResolvedValue(undefined);
  useEditorStore.getState().updateTechnicalDataTextSettings({ backgroundColor: null });
});

afterEach(() => {
  act(() => root.render(<></>));
  vi.clearAllMocks();
});

it('groups page fields as checkboxes and text styling in compact disclosures', async () => {
  await act(async () => root.render(<EditorTechnicalDataPicker onInsert={vi.fn()} />));

  expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(3);
  const disclosures = Array.from(
    container.querySelectorAll<HTMLDetailsElement>('details[data-ui="editor.inspector.disclosure"]')
  );
  expect(disclosures.map((item) => item.querySelector('summary')?.textContent)).toEqual([
    'editor.compact.technicalDataTextSettings',
    'editor.compact.technicalDataFields',
  ]);
  expect(disclosures[0]?.open).toBe(true);
  await act(async () => disclosures[0]?.querySelector('summary')?.click());
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(disclosures[0]?.open).toBe(false);
  expect(Object.values(disclosureValues)).toContain(false);
});

it('remembers both disclosure choices after the picker remounts', async () => {
  await act(async () => root.render(<EditorTechnicalDataPicker onInsert={vi.fn()} />));
  const disclosures = Array.from(
    container.querySelectorAll<HTMLDetailsElement>('details[data-ui="editor.inspector.disclosure"]')
  );
  expect(disclosures).toHaveLength(2);
  await act(async () => disclosures[0]?.querySelector('summary')?.click());
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(disclosures[0]?.open).toBe(false);
  await act(async () => root.render(<></>));
  await act(async () => root.render(<EditorTechnicalDataPicker onInsert={vi.fn()} />));
  const restored = Array.from(
    container.querySelectorAll<HTMLDetailsElement>('details[data-ui="editor.inspector.disclosure"]')
  );
  expect(restored[0]?.open).toBe(false);
  expect(restored[1]?.open).toBe(true);
});

it('keeps page-data typography and colors separate from the text tool', async () => {
  const ordinaryTextSettings = useEditorStore.getState().toolSettings.text;
  await act(async () => root.render(<EditorTechnicalDataPicker onInsert={vi.fn()} />));

  const textColor = container
    .querySelector('[role="group"][aria-label="content.toolbar.drawingTextColor"]')
    ?.querySelector<HTMLButtonElement>(
      '[data-ui="content.toolbar.drawing-options.quick-colors"] button'
    );
  const selectedTextColor = textColor?.title;
  expect(selectedTextColor).toBeTruthy();

  act(() => {
    container
      .querySelector<HTMLButtonElement>('[data-ui="editor.technical-data.font-handwritten"]')
      ?.click();
    container
      .querySelector<HTMLButtonElement>('[data-ui="editor.technical-data.size-36"]')
      ?.click();
    textColor?.click();
  });

  const backgroundToggle = container.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.drawing-options.text.background-none"]'
  );
  expect(backgroundToggle?.getAttribute('aria-pressed')).toBe('false');
  expect(
    container.querySelector('[data-ui="content.toolbar.drawing-options.text.background-colors"]')
  ).toBeNull();
  act(() => backgroundToggle?.click());
  expect(backgroundToggle?.getAttribute('aria-pressed')).toBe('true');
  const backgroundColor = container
    .querySelector('[data-ui="content.toolbar.drawing-options.text.background-colors"]')
    ?.querySelector<HTMLButtonElement>(
      '[data-ui="content.toolbar.drawing-options.quick-colors"] button:nth-child(2)'
    );
  const selectedBackgroundColor = backgroundColor?.title;
  expect(selectedBackgroundColor).toBeTruthy();
  act(() => {
    backgroundColor?.click();
  });

  expect(useEditorStore.getState().technicalDataTextSettings).toMatchObject({
    fontFamily: 'handwritten',
    fontSize: 36,
    color: selectedTextColor,
    backgroundColor: selectedBackgroundColor,
  });
  expect(useEditorStore.getState().toolSettings.text).toBe(ordinaryTextSettings);

  act(() => backgroundToggle?.click());
  expect(useEditorStore.getState().technicalDataTextSettings.backgroundColor).toBeNull();
  expect(
    container.querySelector('[data-ui="content.toolbar.drawing-options.text.background-colors"]')
  ).toBeNull();
  act(() => backgroundToggle?.click());
  expect(useEditorStore.getState().technicalDataTextSettings.backgroundColor).toBe(
    selectedBackgroundColor
  );
});

it('keeps font and size beside their labels with readable controls and quiet color pickers', async () => {
  await act(async () => root.render(<EditorTechnicalDataPicker onInsert={vi.fn()} />));

  for (const [row, options, count] of [
    ['font-row', 'font-options', 4],
    ['size-row', 'size-options', 3],
  ] as const) {
    const rowElement = container.querySelector(`[data-ui="editor.technical-data.${row}"]`);
    const buttons = rowElement?.querySelectorAll(
      `[data-ui="editor.technical-data.${options}"] button`
    );
    expect(rowElement?.className).toContain('items-center');
    expect(buttons).toHaveLength(count);
    for (const button of buttons ?? []) expect(button.className).toContain('h-8');
  }

  const pickerTriggers = container.querySelectorAll('[data-ui="shared.ui.color-selector.trigger"]');
  expect(pickerTriggers).toHaveLength(1);
  for (const trigger of pickerTriggers) {
    expect(trigger.closest('[data-ui="editor.technical-data.text-settings"]')?.className).toContain(
      "[&_[data-ui='shared.ui.color-selector.trigger']]:!shadow-none"
    );
  }
});

it('offers layout only for multiple fields and inserts them in canonical order', async () => {
  const onInsert = vi.fn();
  await act(async () => root.render(<EditorTechnicalDataPicker onInsert={onInsert} />));

  expect(container.textContent).not.toContain('editor.compact.technicalDataLayoutRow');

  act(() => {
    container
      .querySelector<HTMLInputElement>('[data-ui="editor.technical-data.field-browser"]')
      ?.click();
    container
      .querySelector<HTMLInputElement>('[data-ui="editor.technical-data.field-url"]')
      ?.click();
  });

  const layout = Array.from(container.querySelectorAll('button')).find(
    (button) => button.textContent === 'editor.compact.technicalDataLayoutRow'
  );
  expect(layout).toBeTruthy();
  expect(layout?.getAttribute('aria-pressed')).toBe('false');
  expect(layout?.parentElement?.className).toContain('bg-[var(--sniptale-color-surface-hover)]');
  act(() => layout?.click());
  expect(layout?.getAttribute('aria-pressed')).toBe('true');
  expect(layout?.className).toContain('bg-[var(--sniptale-color-surface-panel)]');
  expect(container.querySelector('[aria-label="editor.compact.technicalDataPreview"]')).toBeNull();

  const insert = Array.from(container.querySelectorAll('button')).find(
    (button) => button.textContent === 'editor.compact.technicalDataInsert'
  );
  await act(async () => insert?.click());

  expect(onInsert).toHaveBeenCalledWith(['url', 'browser'], 'row');
  expect(savePreferenceMock).toHaveBeenCalledWith({ kinds: ['url', 'browser'], layout: 'row' });
  expect(insert?.disabled).toBe(false);
});

it('announces the empty preview and keeps insert disabled', async () => {
  await act(async () =>
    root.render(<EditorTechnicalDataPicker onInsert={vi.fn()} variant="compact" />)
  );

  expect(container.textContent).toContain('editor.compact.technicalDataPreviewEmpty');
  expect(
    Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'editor.compact.technicalDataInsert'
    )?.disabled
  ).toBe(true);
});

it('restores the last inserted selection and layout on a new mount', async () => {
  loadPreferenceMock.mockResolvedValueOnce({ kinds: ['date', 'browser'], layout: 'row' });
  const onInsert = vi.fn();
  await act(async () => root.render(<EditorTechnicalDataPicker onInsert={onInsert} />));

  const date = container.querySelector<HTMLInputElement>(
    '[data-ui="editor.technical-data.field-date"]'
  );
  const browser = container.querySelector<HTMLInputElement>(
    '[data-ui="editor.technical-data.field-browser"]'
  );
  expect(date?.checked).toBe(true);
  expect(browser?.checked).toBe(true);
  expect(
    Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent === 'editor.compact.technicalDataLayoutRow')
      ?.getAttribute('aria-pressed')
  ).toBe('true');

  const insert = Array.from(container.querySelectorAll('button')).find(
    (button) => button.textContent === 'editor.compact.technicalDataInsert'
  );
  act(() => insert?.click());
  expect(onInsert).toHaveBeenCalledWith(['date', 'browser'], 'row');
});

it('preserves user changes made before the saved preference loads', async () => {
  let resolveLoad: (value: { kinds: ['date']; layout: 'row' }) => void = () => undefined;
  loadPreferenceMock.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveLoad = resolve;
    })
  );
  act(() => root.render(<EditorTechnicalDataPicker onInsert={vi.fn()} />));
  const url = container.querySelector<HTMLInputElement>(
    '[data-ui="editor.technical-data.field-url"]'
  );
  act(() => url?.click());
  await act(async () => resolveLoad({ kinds: ['date'], layout: 'row' }));
  expect(url?.checked).toBe(true);
  expect(
    container.querySelector<HTMLInputElement>('[data-ui="editor.technical-data.field-date"]')
      ?.checked
  ).toBe(false);
});

it('reports when insertion succeeds but saving the preference fails', async () => {
  savePreferenceMock.mockRejectedValueOnce(new Error('quota'));
  await act(async () => root.render(<EditorTechnicalDataPicker onInsert={vi.fn()} />));
  act(() =>
    container
      .querySelector<HTMLInputElement>('[data-ui="editor.technical-data.field-url"]')
      ?.click()
  );
  await act(async () => {
    Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent === 'editor.compact.technicalDataInsert')
      ?.click();
  });
  expect(container.querySelector('[role="alert"]')?.textContent).toBe(
    'editor.compact.technicalDataPreferenceSaveFailed'
  );
});
