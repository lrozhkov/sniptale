import { createContext, useContext, useRef, type PropsWithChildren } from 'react';

interface RememberedSection {
  id: string;
  focus: boolean;
}
const InspectorSectionMemoryContext = createContext<Map<string, RememberedSection> | null>(null);
export const InspectorSelectionFamilyContext = createContext('scene');

/** Category memory lasts for this workspace session, including a temporarily closed inspector. */
export function InspectorSectionMemoryProvider({ children }: PropsWithChildren) {
  const memory = useRef(new Map<string, RememberedSection>());
  return (
    <InspectorSectionMemoryContext.Provider value={memory.current}>
      {children}
    </InspectorSectionMemoryContext.Provider>
  );
}

export function useInspectorSectionMemory(targetFamily?: string) {
  const memory = useContext(InspectorSectionMemoryContext);
  const currentFamily = useContext(InspectorSelectionFamilyContext);
  const family = targetFamily ?? currentFamily;
  const entry = memory?.get(family);
  return {
    family,
    remembered: entry?.id,
    remember: (id: string) => memory?.set(family, { id, focus: false }),
    requestReturn: (id: string) => memory?.set(family, { id, focus: true }),
    returnFocusIntent: entry?.focus
      ? { groupId: entry.id, token: `return:${family}:${entry.id}` }
      : null,
    consumeReturn: () => {
      if (entry?.focus && memory?.get(family) === entry)
        memory.set(family, { ...entry, focus: false });
    },
  };
}
