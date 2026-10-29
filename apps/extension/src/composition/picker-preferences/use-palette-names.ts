import { useEffect, useState } from 'react';
import {
  loadDrawingPaletteState,
  subscribeToDrawingPaletteState,
} from '../persistence/drawing-palette';

/** A read-only view of the existing palette authority; absence retains automatic CSS names. */
export function usePaletteNames(): Readonly<Record<string, string>> {
  const [names, setNames] = useState<Readonly<Record<string, string>>>({});
  useEffect(() => {
    let active = true;
    let observed = false;
    const stop = subscribeToDrawingPaletteState((state) => {
      observed = true;
      if (active) setNames(state.names ?? {});
    });
    void loadDrawingPaletteState()
      .then((state) => {
        if (active && !observed) setNames(state.names ?? {});
      })
      .catch(() => undefined);
    return () => {
      active = false;
      stop();
    };
  }, []);
  return names;
}
