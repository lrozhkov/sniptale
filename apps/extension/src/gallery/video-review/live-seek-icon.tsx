import { memo } from 'react';
import caretDownIcon from '@iconify-icons/tabler/caret-down';
import { Icon } from '@iconify/react';

const playheadIcon = {
  ...caretDownIcon,
  body: `<g transform="translate(0 -5)">${caretDownIcon.body}</g><path fill="none" d="M12 11v11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
};

/** Keep Iconify's SVG DOM independent of the playback clock and toolbar measurement. */
export const ReviewLiveSeekIcon = memo(function ReviewLiveSeekIcon() {
  return (
    <Icon className="shrink-0" icon={playheadIcon} width={16} height={16} aria-hidden="true" />
  );
});
