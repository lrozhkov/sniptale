// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

vi.mock('../../../ui/highlighter-preset-editor/callout/inspector', () => ({
  CalloutManualSettings: (props: Record<string, any>) => (
    <button onClick={() => props['saveSection'].onCreate('Copy')}>save inherited tags</button>
  ),
}));
vi.mock('../popover/template-fork', () => ({
  TemplateForkReturnGuard: () => null,
  useTemplateForkWorkflow: () => ({
    completeSave: vi.fn(),
    confirmingReturn: false,
    continueEditing: vi.fn(),
    discard: vi.fn(),
    fork: vi.fn(),
    goToSave: vi.fn(),
    requestTemplates: vi.fn(),
    saveRequest: 0,
    session: {
      mode: 'temporary',
      sourceTemplate: { id: 'source', tagIds: ['review', 'training'] },
    },
  }),
}));

import { CalloutSettingsPopoverContent } from './body';
import { createDefaultCalloutSettings } from '../../../features/highlighter/frame-annotation/callout/model';

it('inherits source template tags when saving a temporary callout as new', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onCreate = vi.fn(async () => true);
  await act(async () =>
    root.render(
      <CalloutSettingsPopoverContent
        handleDelete={vi.fn()}
        handleSettingChange={vi.fn()}
        headerContext="element"
        localSettings={createDefaultCalloutSettings()}
        onApplyPreset={vi.fn()}
        onClose={vi.fn()}
        onShowPresets={vi.fn()}
        onTogglePreset={vi.fn()}
        pendingPresetIds={new Set()}
        presetError={null}
        presets={[]}
        saveSection={{
          error: null,
          isSaving: false,
          onCreate,
          onOverwrite: vi.fn(async () => true),
          presets: [],
        }}
      />
    )
  );
  const save = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
    button.textContent?.includes('save inherited tags')
  );
  await act(async () => save?.click());
  expect(onCreate).toHaveBeenCalledWith('Copy', ['review', 'training']);
  act(() => root.unmount());
  host.remove();
});
