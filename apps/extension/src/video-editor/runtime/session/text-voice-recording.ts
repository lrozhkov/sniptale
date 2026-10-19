import { useContext, useEffect, useRef, useState } from 'react';
import { useAudioRecordingDialogSession } from '../../../composition/audio-recording/dialog/controller';
import { useRecordingDurationLimit } from '../../../composition/audio-recording/dialog/duration-limit';
import { captureVideoProjectVoiceTextBasis } from '../../../features/video/project/text/voice-scope';
import {
  prepareProjectLocalTextVoice,
  cleanupProjectVoiceTakePreview,
  type ProjectVoiceTakeAccess,
  type ProjectVoiceTakePreview,
} from '../../../workflows/video/project-voice-take';
import { RuntimeProjectContext } from '../controller/composition/contexts';
import { useVideoEditorPlaybackPort } from '../controller/store';

type Target = { documentId: string; fragmentId: string };
type Capture = Target & { hash: string; access: ProjectVoiceTakeAccess };

function useRecordingLeaveProtection(
  enabled: boolean,
  session: ReturnType<typeof useAudioRecordingDialogSession>
) {
  const current = useRef({ enabled });
  current.current = { enabled };
  const released = useRef(false);
  const continuation = useRef<{ accept(): void; cancel(): void } | null>(null);
  const admission = useContext(RuntimeProjectContext)?.recordingLeave;
  const leave = useRef<() => Promise<boolean>>(async () => true);
  leave.current = () => {
    if (!current.current.enabled || released.current) return Promise.resolve(true);
    if (session.isSaving || session.confirmation.isPending()) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      continuation.current = { accept: () => resolve(true), cancel: () => resolve(false) };
      session.requestClose();
    });
  };
  const register = admission?.register;
  const setCapturing = admission?.setCapturing;
  useEffect(() => register?.(() => leave.current()), [register]);
  useEffect(() => {
    setCapturing?.(
      enabled &&
        (session.starting ||
          session.isSaving ||
          session.confirmation.open ||
          session.controller.transport.status === 'recording')
    );
    return () => setCapturing?.(false);
  }, [
    setCapturing,
    enabled,
    session.starting,
    session.isSaving,
    session.confirmation.open,
    session.controller.transport.status,
  ]);
  useEffect(
    () => () => {
      continuation.current?.cancel();
      continuation.current = null;
    },
    []
  );
  const sessionRef = useRef(session);
  sessionRef.current = session;
  useEffect(() => {
    if (!enabled) {
      continuation.current?.cancel();
      continuation.current = null;
      sessionRef.current.confirmation.cancel();
    }
  }, [enabled]);
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      const value = sessionRef.current;
      if (
        !current.current.enabled ||
        (!value.starting && !value.isSaving && value.controller.transport.status === 'idle')
      )
        return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, []);
  return {
    started() {
      released.current = false;
    },
    closed() {
      released.current = true;
      const next = continuation.current;
      continuation.current = null;
      next?.accept();
    },
    dismiss(next: () => void) {
      if (released.current) {
        next();
        return;
      }
      if (session.isSaving || session.confirmation.isPending()) return;
      continuation.current = { accept: next, cancel: () => undefined };
      session.requestClose();
    },
    confirmation: {
      ...session.confirmation,
      cancel() {
        continuation.current?.cancel();
        continuation.current = null;
        session.confirmation.cancel();
      },
    },
  };
}

/** Capture and raw-take recovery stay mounted when the inspector view is hidden. */
export function useProjectTextVoiceRecording(args: {
  access: ProjectVoiceTakeAccess;
  target: Target | null;
  enabled: boolean;
  accepted: boolean;
  parentVisible: boolean;
  onPrepared(preview: ProjectVoiceTakePreview): boolean;
}) {
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(true);
  const obscured = useContext(RuntimeProjectContext)?.recordingLeave?.obscured ?? false;
  const durationLimit = useRecordingDurationLimit(3600);
  const setPlaying = useVideoEditorPlaybackPort((port) => port.setPlaying);
  const captured = useRef<Capture | null>(null);
  const retained = useRef<(() => void) | undefined>(undefined);
  const current = useRef({ ...args, visible });
  current.current = { ...args, visible: visible && !obscured };
  const admitted = () => {
    const value = current.current;
    if (!value.enabled || !value.parentVisible || !value.visible || !value.target)
      throw new Error('stale');
    return value;
  };
  const session = useAudioRecordingDialogSession({
    isOpen: args.enabled && open,
    retainAfterSave: true,
    suspended: !visible || obscured || !args.parentVisible,
    captureLimitSeconds: durationLimit.seconds,
    timeline: {
      startTime: 0,
      duration: 3600,
      beforeStart: async () => {
        retained.current = undefined;
        leave.started();
        const owner = admitted();
        const target = owner.target!;
        const project = owner.access.getProject();
        if (!project) throw new Error('stale');
        const initial = JSON.stringify(project);
        const basis = await captureVideoProjectVoiceTextBasis(
          project,
          target.documentId,
          target.fragmentId
        );
        const latest = admitted();
        if (latest.access !== owner.access || JSON.stringify(owner.access.getProject()) !== initial)
          throw new Error('stale');
        setPlaying(false);
        captured.current = { ...target, hash: basis.basisHash, access: owner.access };
      },
      onStop: () => undefined,
      onResume: async () => {
        admitted();
        setPlaying(false);
      },
    },
    onClose: () => {
      setOpen(false);
      captured.current = null;
      retained.current = undefined;
      leave.closed();
    },
    onSave: async (file, _trim, signal, _take, onRetained) => {
      retained.current = onRetained;
      const basis = captured.current;
      const owner = current.current;
      if (!basis || basis.access !== owner.access) throw new Error('stale');
      const preview = await prepareProjectLocalTextVoice({
        access: basis.access,
        documentId: basis.documentId,
        fragmentId: basis.fragmentId,
        selection: { kind: 'file', file },
        kind: 'microphone',
        recordingBasisHash: basis.hash,
        signal,
      });
      const latest = current.current;
      if (
        signal.aborted ||
        !latest.enabled ||
        latest.access !== basis.access ||
        latest.target?.documentId !== basis.documentId ||
        latest.target.fragmentId !== basis.fragmentId ||
        !latest.onPrepared(preview)
      ) {
        await cleanupProjectVoiceTakePreview(preview);
        throw new Error('stale');
      }
    },
  });
  const leave = useRecordingLeaveProtection(args.enabled && !args.accepted, session);
  useEffect(() => {
    if (args.enabled && !open) setOpen(true);
  }, [args.enabled, open]);
  useEffect(() => {
    if (!args.enabled) {
      captured.current = null;
      retained.current = undefined;
    }
  }, [args.enabled]);
  return {
    session,
    durationLimit,
    setVisible,
    obscured,
    markRetained() {
      retained.current?.();
    },
    dismiss: leave.dismiss,
    confirmation: leave.confirmation,
  };
}
