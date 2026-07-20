import { translate } from '../../../platform/i18n';
import { ColorField } from '../../chrome/ui';
import { createEditorColorPatchHandlers } from './color-actions';

export function ToolColorSection<TPatch>(props: {
  applyPatch: (patch: TPatch) => void;
  createPatch: (color: string) => TPatch;
  palette: readonly string[];
  previewColor: (setter: (next: string) => void, color: string) => void;
  recentColors: string[];
  titleKey: Parameters<typeof translate>[0];
  updateColor: (setter: (next: string) => void, color: string) => void;
  value: string;
}) {
  const title = translate(props.titleKey);
  const colorHandlers = createEditorColorPatchHandlers({
    applyPatch: props.applyPatch,
    createPatch: props.createPatch,
    previewColor: props.previewColor,
    updateColor: props.updateColor,
  });

  return (
    <ColorField
      title={title}
      label={title}
      value={props.value}
      recentColors={props.recentColors}
      palette={props.palette}
      {...colorHandlers}
    />
  );
}
