import type { Settings } from '../../../../../contracts/settings';

type EditorImageFormat = Settings['imageFormat'];

export const SAVE_FORMAT_OPTIONS: Array<{
  label: string;
  value: EditorImageFormat;
}> = [
  {
    label: 'PNG',
    value: 'png',
  },
  {
    label: 'JPG',
    value: 'jpeg',
  },
  {
    label: 'WEBP',
    value: 'webp',
  },
];

export const formatOptionBaseClassName = [
  'flex h-9 items-center justify-center rounded-[10px] border border-transparent px-2',
  'text-center transition',
  'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_82%,transparent)]',
  'focus-visible:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_82%,transparent)]',
].join(' ');

export const formatOptionSelectedClassName = [
  'border-[color:var(--sniptale-color-border-strong)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_72%,transparent)]',
  'text-[color:var(--sniptale-color-text-primary)]',
].join(' ');

export const formatOptionIdleClassName = [
  'bg-transparent text-[color:var(--sniptale-color-text-secondary)]',
  'hover:text-[color:var(--sniptale-color-text-primary)]',
].join(' ');
