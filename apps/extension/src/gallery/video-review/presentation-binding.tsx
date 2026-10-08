import { constrainPresentationTiming } from '../../features/video/review/advanced/presentation';
import { useLayoutEffect, useRef } from 'react';
import { translate } from '../../platform/i18n';
import { ReviewButton } from './controls';
import { ReviewPresentationInspector } from './presentation-inspector';
import { ReviewPresentationLibrary } from './presentation-library';
import type { ReviewPresentationPicker } from './presentation-selection';
import type { useReviewPresentation } from './use-review-presentation';

type Editor = ReturnType<typeof useReviewPresentation>;

/** Maps the scene controller to controls without taking ownership of admitted resources. */
export function ReviewPresentationBinding({
  editor,
  onJoinPreview,
  output,
  mainDuration,
}: {
  editor: Editor;
  mainDuration?: number;
  output?: { width: number; height: number } | undefined;
  onJoinPreview?: ((slot: 'intro' | 'outro', target?: 'fade' | 'join') => void) | undefined;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  const request = editor.picker;
  return (
    <div ref={anchor} className="space-y-2">
      <ReviewPresentationInspector
        output={output}
        settings={editor.settings}
        timing={
          mainDuration
            ? constrainPresentationTiming(editor.settings, mainDuration)
            : editor.settings
        }
        slotModes={editor.slotModes}
        pending={editor.pending}
        error={editor.error}
        onChange={(settings) => void editor.change(settings)}
        onPreview={editor.preview}
        onMode={(slot, mode) => void editor.mode(slot, mode)}
        onChoose={editor.choose}
        onReset={() => void editor.reset()}
        onJoinPreview={onJoinPreview}
        previewDisabled={mainDuration !== undefined && mainDuration <= 0}
      />
      {editor.canRetry && (
        <ReviewButton
          label={translate('gallery.videoReview.retry')}
          disabled={editor.pending}
          onClick={() => void editor.retry()}
        />
      )}
      {editor.audioUnsupported && (
        <ReviewButton
          label={translate('gallery.videoReview.presentationRetryMuted')}
          disabled={editor.pending}
          onClick={() => void editor.retryMuted()}
        />
      )}
      {request?.source === 'computer' && <ComputerSelection request={request} editor={editor} />}
      {request?.source === 'library' && (
        <ReviewPresentationLibrary
          anchor={anchor.current}
          kind={request.kind}
          busy={editor.pending}
          onClose={editor.cancel}
          onSelect={(id) => void editor.selectLibrary(request, id)}
        />
      )}
    </div>
  );
}

/** The exact controller request survives the native picker until selection or cancellation. */
function ComputerSelection({
  request,
  editor,
}: {
  request: ReviewPresentationPicker;
  editor: Editor;
  mainDuration?: number;
}) {
  const input = useRef<HTMLInputElement>(null);
  const cancel = useRef(editor.cancel);
  cancel.current = editor.cancel;
  useLayoutEffect(() => {
    const element = input.current;
    const onCancel = () => cancel.current();
    element?.addEventListener('cancel', onCancel);
    element?.click();
    return () => element?.removeEventListener('cancel', onCancel);
  }, [request]);
  return (
    <input
      ref={input}
      type="file"
      className="hidden"
      aria-label={translate('gallery.videoReview.presentationComputer')}
      accept={
        request.kind === 'media'
          ? 'image/*,video/*'
          : request.kind === 'image'
            ? 'image/*'
            : 'video/*'
      }
      onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        if (file) void editor.selectComputer(request, file);
        else editor.cancel();
      }}
    />
  );
}
