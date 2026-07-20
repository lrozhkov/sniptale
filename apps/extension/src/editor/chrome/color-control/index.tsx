import { CompactColorSelector, type CompactColorSelectorProps } from '../../../ui/color-selector';

export type EditorColorControlProps = CompactColorSelectorProps;

/**
 * Thin compatibility facade over the shared compact color selector.
 */
export function EditorColorControl(props: EditorColorControlProps) {
  return <CompactColorSelector {...props} />;
}
