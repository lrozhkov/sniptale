import { createContext, useContext, type PropsWithChildren } from 'react';
import type { EditorEmbedMode } from '../../../features/editor/contracts/embed';

interface EditorEmbedContextValue {
  mode: EditorEmbedMode | null;
  onApply: (() => Promise<void>) | null;
  onClose: (() => void) | null;
}

const EditorEmbedContext = createContext<EditorEmbedContextValue>({
  mode: null,
  onApply: null,
  onClose: null,
});

export function EditorEmbedProvider(props: PropsWithChildren<EditorEmbedContextValue>) {
  return <EditorEmbedContext.Provider value={props}>{props.children}</EditorEmbedContext.Provider>;
}

export function useEditorEmbedContext() {
  return useContext(EditorEmbedContext);
}
