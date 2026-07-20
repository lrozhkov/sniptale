import type { PageStyleInspectorActions, PageStyleInspectorViewState } from '../types';
import { AppearanceSection, BoxSection, ImageSection, TextSection } from './section-registry';

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
