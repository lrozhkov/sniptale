import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { VideoEditorEffectDocumentDragPayload } from '../contracts/effect-document-drag';

type Drag = VideoEditorEffectDocumentDragPayload & { duration: number };
const Context = createContext<{ drag: Drag | null; start(value: Drag): void; end(): void }>({
  drag: null,
  start: () => undefined,
  end: () => undefined,
});

/** One disposable drag session shared by the source catalog and timeline placement preview. */
export function EffectDocumentDragProvider({ children }: { children: ReactNode }) {
  const [drag, setDrag] = useState<Drag | null>(null);
  useEffect(() => {
    const end = () => setDrag(null);
    window.addEventListener('dragend', end, true);
    return () => window.removeEventListener('dragend', end, true);
  }, []);
  return (
    <Context.Provider value={{ drag, start: setDrag, end: () => setDrag(null) }}>
      {children}
    </Context.Provider>
  );
}
export function useEffectDocumentDrag() {
  return useContext(Context);
}
