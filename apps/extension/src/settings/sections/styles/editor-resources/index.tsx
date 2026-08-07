import { EditorResourcesContent } from './content';

export function EditorResourcesSection(props: {
  onViewChange?: (view: string) => void;
  view?: string;
}) {
  return <EditorResourcesContent {...props} />;
}
