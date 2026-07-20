export function applyResolvedPickerColorChange(args: {
  onColorChange: (color: string) => void;
  resolvedColor: string | null;
}) {
  if (args.resolvedColor) {
    args.onColorChange(args.resolvedColor);
  }
}
