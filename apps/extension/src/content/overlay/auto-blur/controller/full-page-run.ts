import { useCallback, useEffect, useRef, useState } from 'react';

type ActiveFullPageRun = {
  controller: AbortController;
  owner: 'apply-once' | 'auto-apply';
  token: symbol;
};

export function useAutoBlurFullPageRun() {
  const [isRunning, setIsRunning] = useState(false);
  const activeRunRef = useRef<ActiveFullPageRun | null>(null);

  const cancel = useCallback((owner?: ActiveFullPageRun['owner']) => {
    const activeRun = activeRunRef.current;
    if (activeRun && (owner === undefined || activeRun.owner === owner)) {
      activeRun.controller.abort();
    }
  }, []);

  const run = useCallback(
    async <T>(
      owner: ActiveFullPageRun['owner'],
      operation: (signal: AbortSignal) => Promise<T>
    ) => {
      activeRunRef.current?.controller.abort();
      const activeRun = {
        controller: new AbortController(),
        owner,
        token: Symbol('auto-blur-run'),
      };
      activeRunRef.current = activeRun;
      setIsRunning(true);
      try {
        return await operation(activeRun.controller.signal);
      } finally {
        if (activeRunRef.current?.token === activeRun.token) {
          activeRunRef.current = null;
          setIsRunning(false);
        }
      }
    },
    []
  );

  useEffect(() => cancel, [cancel]);

  return { cancel, isRunning, run };
}
