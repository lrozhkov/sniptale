// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { translate } from '../../platform/i18n';
import { SpeechProfileFields, SpeechTranscriptionModelField } from './speech-profile';

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

it('uses the configured selector for either operation and preserves explicit voice edits', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const select = vi.fn();
  const change = vi.fn();
  const speech: ComponentProps<typeof SpeechProfileFields>['speech'] = {
    catalogs: null,
    modelId: '',
    setModelId: select,
    profile: undefined,
    changeProfile: change,
  };
  const render = (operation: 'all' | 'speech' | 'transcription' = 'all') =>
    act(async () => {
      root.render(<SpeechProfileFields speech={speech} operation={operation} />);
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
    await render('transcription');
    expect(host.querySelector('[role="status"]')?.textContent).toBe(
      translate('common.states.loading')
    );
    speech.catalogs = {
      transcription: {
        chromeAiEnabled: false,
        defaultModelId: 'model',
        globalSystemPrompt: '',
        models: [
          { id: 'model', modelCode: 'fixture', displayName: 'Model', providerId: 'provider' },
        ],
        providers: [],
      },
      speech: {
        chromeAiEnabled: false,
        defaultModelId: 'model',
        globalSystemPrompt: '',
        models: [
          {
            id: 'model',
            modelCode: 'fixture',
            displayName: 'Voice',
            providerId: 'provider',
            audio: { speech: { voiceId: 'voice', responseFormat: 'mp3', speed: 1 } },
          },
        ],
        providers: [],
      },
    };
    await render('transcription');
    await click('Choose configured model');
    expect(select).toHaveBeenLastCalledWith('model');
    await click('Clear configured model');
    expect(select).toHaveBeenLastCalledWith('');
    expect(change).not.toHaveBeenCalled();
    await render('speech');
    await click('Clear configured model');
    expect(change).not.toHaveBeenCalled();
    await click('Choose configured model');
    expect(change).toHaveBeenLastCalledWith({
      modelId: 'model',
      voiceId: 'voice',
      responseFormat: 'mp3',
      speed: 1,
    });
    speech.profile = { modelId: 'model', voiceId: 'voice', responseFormat: 'mp3' };
    await render();
    const voice = host.querySelector<HTMLInputElement>(
      `input[aria-label="${translate('gallery.videoReview.speechVoice')}"]`
    );
    if (!voice) throw new Error('Missing voice field');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        voice,
        'new voice'
      );
      voice.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(change).toHaveBeenLastCalledWith({ ...speech.profile, voiceId: 'new voice' });
    speech.profile = { ...speech.profile, voiceId: 'new voice', instructions: 'Keep the voice' };
    for (const responseFormat of ['pcm', 'wav', 'mp3'] as const) {
      await render('speech');
      const format = host.querySelector<HTMLButtonElement>(
        `button[aria-label="${translate('gallery.videoReview.speechFormat')}"]`
      );
      if (!format) throw new Error('Missing format field');
      await act(async () => format.click());
      const label =
        responseFormat === 'pcm'
          ? translate('settings.aiProviders.modelAudioPcm')
          : responseFormat.toUpperCase();
      const option = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(
        (node) => node.textContent === label
      );
      if (!option) throw new Error('Missing format option');
      await act(async () => option.click());
      expect(change).toHaveBeenLastCalledWith({ ...speech.profile, responseFormat });
      speech.profile = { ...speech.profile, responseFormat };
    }
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
