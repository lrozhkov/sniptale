import { EditorSectionContent } from './content';
import { useEditorSection } from './controller';

export function EditorSection() {
  const state = useEditorSection();
  return <EditorSectionContent state={state} />;
}
