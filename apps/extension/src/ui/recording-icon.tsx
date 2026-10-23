import { Circle, type LucideProps } from 'lucide-react';

/** Draws the recording marker with a distinct outer ring and filled center. */
export function RecordingIcon(props: LucideProps) {
  return (
    <Circle {...props} fill="none" data-icon="recording">
      <circle cx="12" cy="12" r="7" fill="currentColor" stroke="none" />
    </Circle>
  );
}
