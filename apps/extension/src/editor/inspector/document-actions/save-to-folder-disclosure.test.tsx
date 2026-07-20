import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';

const disclosureMocks = vi.hoisted(() => ({
  isOpen: false,
  storageKeys: [] as string[],
  toggle: vi.fn(),
}));
const presetOptionsMock = vi.hoisted(() => vi.fn());

vi.mock('./disclosure-shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./disclosure-shared')>()),
  usePersistentDisclosureState: (storageKey: string) => {
    disclosureMocks.storageKeys.push(storageKey);
    return { isOpen: disclosureMocks.isOpen, toggle: disclosureMocks.toggle };
  },
}));

vi.mock('./presets', () => ({
  EditorInspectorDocumentPresetOptions: (props: unknown) => {
    presetOptionsMock(props);
    return <div data-ui="preset-options" />;
  },
}));

import { EditorDocumentSaveToFolderDisclosure } from './save-to-folder-disclosure';

const savePresets = [{ enabled: true, id: 'preset-1', name: 'Team', order: 0, path: 'team' }];

beforeEach(() => {
  disclosureMocks.isOpen = false;
  disclosureMocks.storageKeys.length = 0;
  vi.clearAllMocks();
});

it('keeps preset options hidden while the persisted disclosure is closed', () => {
  const markup = renderToStaticMarkup(
    <EditorDocumentSaveToFolderDisclosure
      defaultImagePresetId={null}
      feedbackPresetId={null}
      savePresets={savePresets}
      savingPresetId={null}
      onSaveToPreset={vi.fn()}
    />
  );

  expect(markup).toContain('aria-expanded="false"');
  expect(markup).not.toContain('data-ui="preset-options"');
  expect(presetOptionsMock).not.toHaveBeenCalled();
  expect(disclosureMocks.storageKeys).toEqual(['sniptale_editor_file_menu_save_to_folder_open']);
});

it('renders summary and forwards every preset option while open', () => {
  disclosureMocks.isOpen = true;
  const onSaveToPreset = vi.fn();
  const markup = renderToStaticMarkup(
    <EditorDocumentSaveToFolderDisclosure
      defaultImagePresetId="preset-1"
      feedbackPresetId="preset-1"
      savePresets={savePresets}
      savingPresetId="preset-1"
      summary="Team"
      onSaveToPreset={onSaveToPreset}
    />
  );

  expect(markup).toContain('aria-expanded="true"');
  expect(markup).toContain('Team');
  expect(markup).toContain('data-ui="preset-options"');
  expect(presetOptionsMock).toHaveBeenCalledWith({
    defaultImagePresetId: 'preset-1',
    feedbackPresetId: 'preset-1',
    onSaveToPreset,
    savePresets,
    savingPresetId: 'preset-1',
  });
});
