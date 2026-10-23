// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { SpeechSynthesisProfileFields } from './profile';
import { InspectorLayout } from '../../compact-inspector-controls/layout';
import { translate } from '../../../platform/i18n';
import type { ReviewSpeechProfile } from '../../../features/video/review/speech-transcript';

afterEach(() => vi.unstubAllGlobals());
it('retains the accepted speed after Escape and commits one numeric edit on Enter', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const change = vi.fn();
  function Harness() {
    const [profile, setProfile] = useState<ReviewSpeechProfile>({
      modelId: 'speech',
      voiceId: 'voice',
      responseFormat: 'wav',
      speed: 1,
    });
    return (
      <InspectorLayout>
        <SpeechSynthesisProfileFields
          catalog={null}
          profile={profile}
          preferenceId="test.speech"
          onChange={(next) => {
            change(next);
            setProfile(next);
          }}
        />
      </InspectorLayout>
    );
  }
  try {
    await act(async () => root.render(<Harness />));
    const speed = host.querySelector<HTMLInputElement>(
      `input[aria-label="${translate('gallery.videoReview.speechSpeed')}"]`
    )!;
    const input = async (value: string) =>
      act(async () => {
        speed.focus();
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
          speed,
          value
        );
        speed.dispatchEvent(new Event('input', { bubbles: true }));
      });
    await input('1.75');
    await act(async () =>
      speed.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      )
    );
    await act(async () => speed.blur());
    expect(change).not.toHaveBeenCalled();
    await input('1.5');
    await act(async () =>
      speed.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
      )
    );
    expect(change).toHaveBeenCalledOnce();
    expect(change).toHaveBeenLastCalledWith(expect.objectContaining({ speed: 1.5 }));
    await act(async () =>
      host.querySelector<HTMLButtonElement>('button[aria-label="MP3"]')!.click()
    );
    expect(change).toHaveBeenLastCalledWith(
      expect.objectContaining({ speed: 1.5, responseFormat: 'mp3' })
    );
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
