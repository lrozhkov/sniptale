type ColorSetter = (next: string) => void;
type ColorAction = (setter: ColorSetter, color: string) => void;

export function createEditorColorPatchHandlers<TPatch>(args: {
  applyPatch: (patch: TPatch) => void;
  createPatch: (color: string) => TPatch;
  previewColor: ColorAction;
  updateColor: ColorAction;
}) {
  const applyColor = (next: string) => args.applyPatch(args.createPatch(next));

  return {
    onChange: (color: string) => args.updateColor(applyColor, color),
    onPreviewChange: (color: string) => args.previewColor(applyColor, color),
    onPreviewReset: (color: string) => args.previewColor(applyColor, color),
  };
}
