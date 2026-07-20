import { TRANSPARENT_COLOR } from '../../document/model';

export function isRecordableRecentColor(color: string): boolean {
  const normalizedColor = color.trim().toLowerCase();
  return normalizedColor !== TRANSPARENT_COLOR && /^#[0-9a-f]{6}$/.test(normalizedColor);
}

export function buildSidebarColorActions(args: {
  rememberRecentColor: (color: string) => Promise<void>;
  withHistoryMuted: (callback: () => void) => void;
}) {
  return {
    previewColor: (setter: (value: string) => void, color: string) => {
      args.withHistoryMuted(() => {
        setter(color);
      });
    },
    updateColor: (setter: (value: string) => void, color: string) => {
      setter(color);
      if (isRecordableRecentColor(color)) {
        void args.rememberRecentColor(color);
      }
    },
  };
}
