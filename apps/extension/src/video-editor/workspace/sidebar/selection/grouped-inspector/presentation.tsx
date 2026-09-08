import { createContext, useContext, useRef, type PropsWithChildren } from 'react';

const InspectorSectionMemoryContext = createContext<Map<string, string> | null>(null);
export const InspectorSelectionFamilyContext = createContext('scene');

/** Category memory lasts for this workspace session, including a temporarily closed inspector. */
export function InspectorSectionMemoryProvider({ children }: PropsWithChildren) {
  const memory = useRef(new Map<string, string>());
  return (
    <InspectorSectionMemoryContext.Provider value={memory.current}>
      {children}
    </InspectorSectionMemoryContext.Provider>
  );
}

export function useInspectorSectionMemory() {
  const memory = useContext(InspectorSectionMemoryContext);
  const family = useContext(InspectorSelectionFamilyContext);
  return {
    family,
    remembered: memory?.get(family),
    remember: (id: string) => memory?.set(family, id),
  };
}
