import { Icon } from '@iconify/react';
import albumIcon from '@iconify-icons/tabler/album';
import layoutBoardIcon from '@iconify-icons/tabler/layout-board';
import photoEditIcon from '@iconify-icons/tabler/photo-edit';

type FooterApplicationIconProps = { className?: string };

function createFooterApplicationIcon(icon: typeof albumIcon) {
  return function FooterApplicationIcon(props: FooterApplicationIconProps) {
    return <Icon icon={icon} className={props.className} aria-hidden="true" />;
  };
}

// The installed Tabler set uses its canonical kebab-case names. These semantic
// exports match the product names requested for the four application launchers.
export const ImageStack = createFooterApplicationIcon(albumIcon);
export const ImageAdjust = createFooterApplicationIcon(photoEditIcon);
export const StoryboardFlow = createFooterApplicationIcon(layoutBoardIcon);
