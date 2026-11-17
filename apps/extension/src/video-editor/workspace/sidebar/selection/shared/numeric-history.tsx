import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { useVideoEditorHistoryPort } from '../../../../runtime/controller/store';
import type {
  VideoEditorProjectHistoryActions,
  VideoEditorProjectHistoryTransactionLease,
} from '../../../../contracts/commands/history';

type NumericHistory = {
  begin: (options: { onlyIfIdle: true }) => VideoEditorProjectHistoryTransactionLease | null;
  end: VideoEditorProjectHistoryActions['endProjectHistoryTransaction'];
  current: (lease: VideoEditorProjectHistoryTransactionLease) => boolean;
  active: boolean;
};
const NumericHistoryContext = createContext<NumericHistory | null>(null);

/** Project inspectors share the existing history owner; preference scopes can opt out. */
export function InspectorNumericHistoryProvider({
  children,
  enabled = true,
}: PropsWithChildren<{ enabled?: boolean }>) {
  const history = useVideoEditorHistoryPort((port) => ({
    begin: port.beginProjectHistoryTransaction,
    end: port.endProjectHistoryTransaction,
    current: port.isProjectHistoryTransactionCurrent,
    active: port.projectHistoryTransactionActive,
  }));
  return (
    <NumericHistoryContext.Provider value={enabled ? history : null}>
      {children}
    </NumericHistoryContext.Provider>
  );
}

type NumericGesture = {
  history: NumericHistory | null;
  lease: VideoEditorProjectHistoryTransactionLease | null;
  restore: (() => void) | null;
  onCancel: (() => void) | undefined;
};
function isCurrent(gesture: NumericGesture) {
  return !gesture.history || (gesture.lease !== null && gesture.history.current(gesture.lease));
}
function end(gesture: NumericGesture) {
  if (gesture.history && gesture.lease) gesture.history.end(gesture.lease);
}

/** One scalar preview retains one origin and one owned lease, regardless of history depth. */
export function useInspectorNumericHistory(
  value: number,
  restore: (origin: number) => void,
  options: { disabled?: boolean | undefined; onCancel?: () => void } = {}
) {
  const history = useContext(NumericHistoryContext);
  const active = useRef<NumericGesture | null>(null);
  // Refusal discards the numeric control draft without publishing a fallback edit.
  const [resetKey, reset] = useState(0);
  const refuse = () => {
    const gesture = active.current;
    active.current = null;
    gesture?.onCancel?.();
    reset((key) => key + 1);
    return false;
  };
  const cancel = useCallback(() => {
    const gesture = active.current;
    active.current = null;
    if (!gesture) return;
    try {
      if (!isCurrent(gesture)) return;
      if (gesture.history && gesture.lease) gesture.history.end(gesture.lease, 'cancel');
      else gesture.restore?.();
    } finally {
      gesture.onCancel?.();
    }
  }, []);
  const disabled = Boolean(history?.active && !(active.current && isCurrent(active.current)));
  useEffect(() => {
    if ((options.disabled || disabled) && active.current?.history) cancel();
  }, [options.disabled, disabled, cancel]);
  useEffect(
    () => () => {
      if (active.current?.history) cancel();
    },
    [cancel]
  );
  const preview = (propose: () => void) => {
    if (!active.current) {
      const lease = history?.begin({ onlyIfIdle: true }) ?? null;
      if (history && !lease) return refuse();
      active.current = {
        history,
        lease,
        restore: history ? null : () => restore(value),
        onCancel: options.onCancel,
      };
    }
    if (!isCurrent(active.current)) {
      return refuse();
    }
    propose();
    return true;
  };
  const commit = (propose: () => void) => {
    const gesture = active.current;
    active.current = null;
    if (gesture ? !isCurrent(gesture) : history?.active) return refuse();
    try {
      propose();
    } finally {
      if (gesture) end(gesture);
    }
    return true;
  };
  return {
    resetKey,
    preview,
    commit,
    cancel,
    disabled,
  };
}
