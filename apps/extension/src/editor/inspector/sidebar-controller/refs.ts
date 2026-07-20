import { useRef } from 'react';

export function useInspectorSidebarRefs() {
  return {
    backgroundImageInputRef: useRef<HTMLInputElement>(null),
    importSessionInputRef: useRef<HTMLInputElement>(null),
    openImageInputRef: useRef<HTMLInputElement>(null),
  };
}
