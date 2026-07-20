import { useEditorStore } from '../../../state/useEditorStore';
import { getNextEditorStepValue } from '../../../objects/step-tool/value';

export function advanceEditorStepValue(): void {
  const store = useEditorStore.getState();
  store.updateStepSettings({ value: getNextEditorStepValue(store.toolSettings.step) });
}
