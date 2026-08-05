export function selectOrClosePopoverPreset<Preset>(args: {
  isActive: boolean;
  onApply: (preset: Preset) => void;
  onClose: () => void;
  preset: Preset;
}) {
  if (args.isActive) {
    args.onClose();
    return;
  }
  args.onApply(args.preset);
}
