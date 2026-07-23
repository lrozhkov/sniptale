import type { PageStyleInspectorActions, PageStyleInspectorViewState } from '../types';
import { ImageSection } from './image-section';
import { AppearanceSection } from './sections/appearance';
import { BoxSection } from './sections/frame';
import { TextSection } from './sections/text';

export function PageStylePropertyControls(props: {
  actions: PageStyleInspectorActions;
  disabled: boolean;
  state: PageStyleInspectorViewState;
}) {
  const selectedKind = props.state.selection?.kind;
  const imageSelected = selectedKind === 'image';

  return (
    <div className="grid gap-2.5">
      {imageSelected ? <ImageSection {...props} /> : <TextSection {...props} />}
      <BoxSection {...props} />
      <AppearanceSection {...props} />
    </div>
  );
}
