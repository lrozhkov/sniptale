import type { PageStyleInspectorActions, PageStyleInspectorViewState } from '../types';
import { ImageSection } from './image-section';
import { AppearanceSection } from './sections/appearance';
import { BoxSection } from './sections/frame';
import { TextSection } from './sections/text';
import { PageStyleCommentField } from './comment';

export function PageStylePropertyControls(props: {
  actions: PageStyleInspectorActions;
  disabled: boolean;
  state: PageStyleInspectorViewState;
}) {
  const selectedKind = props.state.selection?.kind;
  const imageSelected = selectedKind === 'image';

  return (
    <div
      data-ui="content.page-style-inspector.property-controls"
      className="grid w-full min-w-0 max-w-full gap-2.5"
    >
      <PageStyleCommentField
        actions={props.actions.comment}
        disabled={props.disabled}
        state={props.state.comment}
      />
      {imageSelected ? <ImageSection {...props} /> : <TextSection {...props} />}
      <BoxSection {...props} />
      <AppearanceSection {...props} />
    </div>
  );
}
