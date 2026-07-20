import { ContentStrokeIcon } from '../../../icons/icons';

export function ExpandChevronIcon({ expanded, size }: { expanded: boolean; size: 10 | 13 }) {
  return (
    <ContentStrokeIcon
      width={size}
      height={size}
      strokeWidth="2.5"
      className="sniptale-expand-icon"
      style={{ transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}
    >
      <polyline points="6 9 12 15 18 9" />
    </ContentStrokeIcon>
  );
}

export function CheckIcon() {
  return (
    <ContentStrokeIcon width="12" height="12" strokeWidth="2.5">
      <polyline points="20 6 9 17 4 12" />
    </ContentStrokeIcon>
  );
}

export function CheckboxIcon() {
  return (
    <ContentStrokeIcon width="10" height="10" strokeWidth="2.5">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <polyline points="9 11 12 14 20 6" />
    </ContentStrokeIcon>
  );
}

export function CodeBracketsIcon() {
  return (
    <ContentStrokeIcon size={13} strokeWidth="2">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </ContentStrokeIcon>
  );
}

export function CopyIcon() {
  return (
    <ContentStrokeIcon size={12} strokeWidth="2">
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </ContentStrokeIcon>
  );
}
