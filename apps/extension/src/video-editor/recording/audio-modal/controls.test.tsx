import { renderToStaticMarkup } from 'react-dom/server';
import { Mic } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import { AudioRecordingSaveButton, RecordingActionButton } from './controls';

describe('audio-recording-modal/controls', () => {
  it('renders recording and save actions through product action buttons', () => {
    const recordingMarkup = renderToStaticMarkup(
      <RecordingActionButton
        icon={<Mic size={16} />}
        label="videoEditor.app.recordAudioStart"
        onClick={() => undefined}
      />
    );
    const saveMarkup = renderToStaticMarkup(
      <AudioRecordingSaveButton audioBlob={null} disabled={false} onSave={async () => undefined} />
    );

    expect(recordingMarkup).toContain('inline-flex h-10 min-h-10');
    expect(recordingMarkup).toContain('text-[var(--sniptale-color-text-primary)]');
    expect(saveMarkup).toContain('inline-flex h-10 min-h-10');
    expect(saveMarkup).toContain('disabled=""');
  });
});
