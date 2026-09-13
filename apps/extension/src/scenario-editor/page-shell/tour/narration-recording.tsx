import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  resolveThemeSafePortalTarget,
  useResolvedPortalTheme,
} from '@sniptale/ui/theme/safe-portal';
import { MaterialAudioRecordingModal } from '../../../composition/audio-recording/dialog';
import type { Translate } from '../../../platform/i18n';

/** Captured target attachment stays in the scenario page; recorder UI is shared with video. */
export function TourNarrationRecording({
  t,
  onClose,
  onApply,
}: {
  t: Translate;
  onClose: () => void;
  onApply: (blob: Blob, signal: AbortSignal) => Promise<boolean>;
}) {
  const [opener] = useState(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement : null
  );
  const theme = useResolvedPortalTheme(opener);
  return createPortal(
    <div data-theme={theme ?? undefined}>
      <MaterialAudioRecordingModal
        isOpen
        onClose={onClose}
        captureLimitSeconds={3600}
        title={t('scenario.editor.tourRecordAudio')}
        saveLabel={t('scenario.editor.tourAudioApply')}
        onSave={async (file, _trim, signal) => {
          if (!(await onApply(file, signal))) throw new Error('Narration attachment failed.');
        }}
      />
    </div>,
    resolveThemeSafePortalTarget(opener)
  );
}
