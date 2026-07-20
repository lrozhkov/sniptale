import type { ScenarioEditorInsertImagePayload } from '../project/state/types';
import { ScenarioImageStepDialog } from './image-step/ScenarioImageStepDialog';

export function ScenarioImageInsertOverlay(props: {
  imageInsertIndex: number | null;
  onClose: () => void;
  onInsertImage: (index: number, payload: ScenarioEditorInsertImagePayload) => Promise<void>;
}) {
  const imageInsertIndex = props.imageInsertIndex;
  if (imageInsertIndex === null) {
    return null;
  }

  return (
    <ScenarioImageStepDialog
      onClose={props.onClose}
      onInsertImage={async (payload) => {
        await props.onInsertImage(imageInsertIndex, payload);
        props.onClose();
      }}
    />
  );
}
