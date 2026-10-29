// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { translate } from '../../platform/i18n';
import { SpeechTranscriptionModelField } from './speech-profile';

vi.mock('../../features/ai/model-selector', () => ({
  AIModelSelector: (props: {
    selectedModelId: string | null;
    onSelect(id: string | null): void;
  }) => (
    <>
      <span>{props.selectedModelId}</span>
      <button onClick={() => props.onSelect('model')}>Choose configured model</button>
      <button onClick={() => props.onSelect(null)}>Clear configured model</button>
    </>
  ),
}));

it('uses the current transcription selector through loading, selection, clear and controlled value', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const select = vi.fn();
  const speech: ComponentProps<typeof SpeechTranscriptionModelField>['speech'] = {
    catalogs: null,
    modelId: '',
    setModelId: select,
  };
  const render = () =>
    act(async () => {
      root.render(<SpeechTranscriptionModelField speech={speech} />);
    });
  const click = (text: string) =>
    act(async () => {
      const button = Array.from(host.querySelectorAll('button')).find(
        (node) => node.textContent === text
      );
      if (!button) throw new Error('Missing model action');
      button.click();
    });
  try {
    await render();
    expect(host.querySelector('[role="status"]')?.textContent).toBe(
      translate('common.states.loading')
    );
    speech.catalogs = {
      transcription: {
        models: [
          { id: 'model', modelCode: 'fixture', displayName: 'Model', providerId: 'provider' },
        ],
        providers: [],
      },
    };
    await render();
    await click('Choose configured model');
    expect(select).toHaveBeenLastCalledWith('model');
    await click('Clear configured model');
    expect(select).toHaveBeenLastCalledWith('');
    await act(async () =>
      root.render(<SpeechTranscriptionModelField speech={{ ...speech, modelId: 'model' }} />)
    );
    expect(host.textContent).toContain('model');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
