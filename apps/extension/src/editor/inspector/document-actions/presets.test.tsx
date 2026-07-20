import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { translate } from '../../../platform/i18n';
import { EditorInspectorDocumentPresetOptions } from './presets';

function renderPresetsMarkup(options: {
  defaultImagePresetId?: string | null;
  feedbackPresetId?: string | null;
  savingPresetId?: string | null;
}) {
  return renderToStaticMarkup(
    <EditorInspectorDocumentPresetOptions
      defaultImagePresetId={options.defaultImagePresetId ?? 'preset-default'}
      feedbackPresetId={options.feedbackPresetId ?? null}
      savePresets={[
        { enabled: true, id: 'preset-default', name: 'Команда', order: 0, path: 'team' },
        { enabled: true, id: 'preset-archive', name: 'Архив', order: 1, path: 'archive' },
      ]}
      savingPresetId={options.savingPresetId ?? null}
      onSaveToPreset={vi.fn()}
    />
  );
}

describe('EditorInspectorDocumentPresetOptions', () => {
  it('keeps idle preset rows transparent and hover-driven without a default badge', () => {
    const markup = renderPresetsMarkup({});

    expect(markup).toContain('data-default="true"');
    expect(markup).toContain('bg-transparent');
    expect(markup).toContain('hover:bg-');
    expect(markup).not.toContain('surface-input');
    expect(markup).not.toContain('По умолчанию');
  });

  it('keeps transient saving and saved feedback badges', () => {
    const savingMarkup = renderPresetsMarkup({ savingPresetId: 'preset-default' });
    const savedMarkup = renderPresetsMarkup({ feedbackPresetId: 'preset-default' });

    expect(savingMarkup).toContain(translate('common.states.saving'));
    expect(savedMarkup).toContain(translate('common.states.saved'));
  });
});
