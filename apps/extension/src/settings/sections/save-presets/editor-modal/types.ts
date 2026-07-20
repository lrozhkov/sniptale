import type { SavePreset } from '../../../../contracts/settings';

export interface SavePresetEditorModalProps {
  onClose: () => void;
  onSave: (name: string, path: string, enabled: boolean) => Promise<void>;
  preset?: SavePreset;
}
