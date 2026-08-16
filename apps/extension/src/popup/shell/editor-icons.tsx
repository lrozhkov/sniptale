import { ScrollText } from 'lucide-react';

const IMAGE_EDITOR_EDIT_PATH = [
  'm4 15 4-4c.928-.893 2.072-.893 3 0l3 3 1-1c.31-.298.644-.497.987-.596',
  'm2.433 3.206a2.1 2.1 0 0 1 2.97 2.97L18 22h-3v-3l3.42-3.39Z',
].join(' ');

export function ImageEditorIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      data-ui="popup.image-editor-icon"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M15 8h.01M11 20H7a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v4" />
      <path d={IMAGE_EDITOR_EDIT_PATH} />
    </svg>
  );
}

export function ScenarioEditorIcon({ className }: { className?: string }) {
  return <ScrollText aria-hidden="true" className={className} />;
}
