import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useState,
  type ReactNode,
} from 'react';

type Controls = Readonly<Record<string, number | string>>;
interface Preview {
  editorId: string;
  instanceId: string;
  controls: Controls;
}
const EffectPresetEditingContext = createContext<{
  preview: Preview | null;
  begin(preview: Preview): void;
  finish(editorId: string): void;
} | null>(null);

/** Owns transient preset matching across the inspector's separate parameter sections. */
export function EffectPresetEditingProvider({ children }: { children: ReactNode }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const begin = useCallback((next: Preview) => {
    setPreview((current) => (current?.editorId === next.editorId ? current : next));
  }, []);
  const finish = useCallback((editorId: string) => {
    setPreview((current) => (current?.editorId === editorId ? null : current));
  }, []);
  return (
    <EffectPresetEditingContext.Provider value={{ preview, begin, finish }}>
      {children}
    </EffectPresetEditingContext.Provider>
  );
}

/** Releases a preview on commit or when its parameter section is removed. */
export function useEffectPresetEditing(instanceId: string, controls: Controls) {
  const context = useContext(EffectPresetEditingContext);
  const editorId = useId();
  const finish = context?.finish;
  useEffect(() => () => finish?.(editorId), [editorId, finish, instanceId]);
  return {
    begin: () => context?.begin({ editorId, instanceId, controls }),
    finish: () => finish?.(editorId),
  };
}

/** Matches committed controls while preserving live project updates for preview. */
export function useEffectPresetMatchingControls(instanceId: string, controls: Controls) {
  const context = useContext(EffectPresetEditingContext);
  return context?.preview?.instanceId === instanceId ? context.preview.controls : controls;
}
