import { createContext, useContext } from 'react';

export interface InspectorGroupFocusIntent {
  groupId: string;
  token: string;
}

export const InspectorGroupFocusContext = createContext<InspectorGroupFocusIntent | null>(null);

export function useInspectorGroupFocusIntent(): InspectorGroupFocusIntent | null {
  return useContext(InspectorGroupFocusContext);
}
