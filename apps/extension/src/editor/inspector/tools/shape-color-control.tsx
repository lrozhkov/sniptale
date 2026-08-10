export function buildShapeColorControlProps(
  value: string,
  recentColors: string[],
  onChange: (color: string) => void,
  onPreviewChange: (color: string) => void,
  palette: readonly string[]
) {
  return {
    onPreviewChange,
    onPreviewReset: onPreviewChange,
    palette,
    value,
    recentColors,
    onChange,
  };
}
