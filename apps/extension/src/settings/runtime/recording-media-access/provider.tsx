import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { createRecordingMediaAccessSession } from './session';
import {
  readRecordingMediaAccessState,
  retainRecordingMediaDevice,
  subscribeRecordingMediaAccessState,
} from './browser';

const RecordingMediaAccessContext = createContext<{
  activate: () => void;
  failed: boolean;
} | null>(null);

/** Owns recording device access for a targeted Settings document across section navigation. */
export function RecordingMediaAccessProvider({ children }: { children: ReactNode }) {
  const [activated, setActivated] = useState(false);
  const [failed, setFailed] = useState(false);
  const activate = useCallback(() => setActivated(true), []);

  useEffect(() => {
    if (!activated) return;
    let disposed = false;
    const session = createRecordingMediaAccessSession({
      readState: readRecordingMediaAccessState,
      subscribeState: subscribeRecordingMediaAccessState,
      retainDevice: retainRecordingMediaDevice,
      onFailure: () => {
        if (!disposed) setFailed(true);
      },
      onIdle: () => {
        if (!disposed) setFailed(false);
      },
    });
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      session.dispose();
    };
    window.addEventListener('pagehide', dispose);
    return () => {
      window.removeEventListener('pagehide', dispose);
      dispose();
    };
  }, [activated]);

  const value = useMemo(() => ({ activate, failed }), [activate, failed]);
  return (
    <RecordingMediaAccessContext.Provider value={value}>
      {children}
    </RecordingMediaAccessContext.Provider>
  );
}

/** Returns the recording access session owned by the current Settings page. */
export function useRecordingMediaAccess() {
  const session = useContext(RecordingMediaAccessContext);
  if (!session) throw new Error('Settings recording device access owner is unavailable.');
  return session;
}
