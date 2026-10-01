import { useRef, useState } from 'react';
import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import { translate } from '../../../platform/i18n';
import type { AudioRecordingControllerState } from '../session-types';

type Intent = 'close' | 'restart';

/** One admission owner protects the current take across dismissal and replacement. */
export function useRecordingDismissal(args: {
  getController(): AudioRecordingControllerState;
  isBusy(): boolean;
  isActive(): boolean;
  isRetained(take: Blob): boolean;
  close(): void;
  restart(): void;
}) {
  const latest = useRef(args);
  latest.current = args;
  const intent = useRef<Intent | null>(null);
  const [open, setOpen] = useState(false);
  const execute = (action: Intent) => {
    if (action === 'close') latest.current.close();
    else latest.current.restart();
  };
  const request = (action: Intent) => {
    const owner = latest.current;
    if (intent.current || owner.isBusy() || !owner.isActive()) return;
    const controller = owner.getController();
    const capturing = ['recording', 'paused'].includes(controller.transport.status);
    const take = controller.save.audioBlob;
    if (!capturing && (!take || owner.isRetained(take))) {
      execute(action);
      return;
    }
    intent.current = action;
    controller.trim?.pauseSelection();
    if (capturing) controller.transport.pauseRecording();
    setOpen(true);
  };
  const cancel = () => {
    intent.current = null;
    setOpen(false);
  };
  const confirm = () => {
    const action = intent.current;
    if (!action || latest.current.isBusy() || !latest.current.isActive()) return;
    intent.current = null;
    setOpen(false);
    execute(action);
  };
  return { open, request, cancel, confirm, isPending: () => intent.current !== null };
}

/** Render after the recorder so confirmation owns the highest interaction layer. */
export function RecordingDiscardConfirmation(props: {
  value: ReturnType<typeof useRecordingDismissal>;
}) {
  return (
    <ProductConfirmDialog
      isOpen={props.value.open}
      title={translate('videoEditor.app.recordAudioDiscardTitle')}
      message={translate('videoEditor.app.recordAudioDiscardMessage')}
      cancelText={translate('videoEditor.app.recordAudioKeep')}
      confirmText={translate('videoEditor.app.recordAudioDiscard')}
      onCancel={props.value.cancel}
      onConfirm={props.value.confirm}
    />
  );
}
