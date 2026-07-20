import type { CSSProperties } from 'react';
import { Icon } from '@iconify/react';
import alignCenterIcon from '@iconify-icons/tabler/align-center';
import alignJustifiedIcon from '@iconify-icons/tabler/align-justified';
import arrowCurveRightIcon from '@iconify-icons/tabler/arrow-curve-right';
import arrowForwardIcon from '@iconify-icons/tabler/arrow-forward';
import arrowIterationIcon from '@iconify-icons/tabler/arrow-iteration';
import arrowUpRightIcon from '@iconify-icons/tabler/arrow-up-right';
import arrowAutofitWidthIcon from '@iconify-icons/tabler/arrow-autofit-width';
import arrowsRightLeftIcon from '@iconify-icons/tabler/arrows-right-left';
import blurIcon from '@iconify-icons/tabler/blur';
import boldIcon from '@iconify-icons/tabler/bold';
import borderOuterIcon from '@iconify-icons/tabler/border-outer';
import borderRadiusIcon from '@iconify-icons/tabler/border-radius';
import bucketOffIcon from '@iconify-icons/tabler/bucket-off';
import bucketIcon from '@iconify-icons/tabler/bucket';
import bucketDropletIcon from '@iconify-icons/tabler/bucket-droplet';
import colorFilterIcon from '@iconify-icons/tabler/color-filter';
import colorPickerIcon from '@iconify-icons/tabler/color-picker';
import contrastIcon from '@iconify-icons/tabler/contrast';
import dotsVerticalIcon from '@iconify-icons/tabler/dots-vertical';
import diamondIcon from '@iconify-icons/tabler/diamond';
import eraserIcon from '@iconify-icons/tabler/eraser';
import italicIcon from '@iconify-icons/tabler/italic';
import layoutAlignBottomIcon from '@iconify-icons/tabler/layout-align-bottom';
import layoutAlignCenterIcon from '@iconify-icons/tabler/layout-align-center';
import layoutAlignTopIcon from '@iconify-icons/tabler/layout-align-top';
import lassoIcon from '@iconify-icons/tabler/lasso';
import layersIntersect2Icon from '@iconify-icons/tabler/layers-intersect-2';
import lineDashedIcon from '@iconify-icons/tabler/line-dashed';
import lineDottedIcon from '@iconify-icons/tabler/line-dotted';
import linkIcon from '@iconify-icons/tabler/link';
import linkOffIcon from '@iconify-icons/tabler/link-off';
import listNumbersIcon from '@iconify-icons/tabler/list-numbers';
import lockIcon from '@iconify-icons/tabler/lock';
import lockOpenIcon from '@iconify-icons/tabler/lock-open';
import paletteIcon from '@iconify-icons/tabler/palette';
import paintIcon from '@iconify-icons/tabler/paint';
import pencilIcon from '@iconify-icons/tabler/pencil';
import rectangleIcon from '@iconify-icons/tabler/rectangle';
import resizeIcon from '@iconify-icons/tabler/resize';
import routeIcon from '@iconify-icons/tabler/route';
import selectIcon from '@iconify-icons/tabler/select';
import shapeIcon from '@iconify-icons/tabler/shape';
import shadowIcon from '@iconify-icons/tabler/shadow';
import shadowOffIcon from '@iconify-icons/tabler/shadow-off';
import squareNumber1Icon from '@iconify-icons/tabler/square-number-1';
import squareRoundedIcon from '@iconify-icons/tabler/square-rounded';
import squaresDiagonalIcon from '@iconify-icons/tabler/squares-diagonal';
import strikethroughIcon from '@iconify-icons/tabler/strikethrough';
import templateIcon from '@iconify-icons/tabler/template';
import textColorIcon from '@iconify-icons/tabler/text-color';
import textSizeIcon from '@iconify-icons/tabler/text-size';
import underlineIcon from '@iconify-icons/tabler/underline';

type IconifyIconData = {
  body: string;
  height?: number;
  width?: number;
};

export type TablerIconName =
  | 'tabler:align-center'
  | 'tabler:align-justified'
  | 'tabler:align-left-2'
  | 'tabler:align-right-2'
  | 'tabler:arrow-autofit-width'
  | 'tabler:arrow-curve-right'
  | 'tabler:arrow-forward'
  | 'tabler:arrow-iteration'
  | 'tabler:arrow-up-right'
  | 'tabler:arrows-right-left'
  | 'tabler:background'
  | 'tabler:blur'
  | 'tabler:bold'
  | 'tabler:border-corner-rounded'
  | 'tabler:border-corner-square'
  | 'tabler:border-outer'
  | 'tabler:border-radius'
  | 'tabler:bucket'
  | 'tabler:bucket-droplet'
  | 'tabler:bucket-off'
  | 'tabler:color-filter'
  | 'tabler:color-picker'
  | 'tabler:contrast-filled'
  | 'tabler:diamond'
  | 'tabler:dots-vertical'
  | 'tabler:eraser'
  | 'tabler:italic'
  | 'tabler:layout-align-bottom'
  | 'tabler:layout-align-center'
  | 'tabler:layout-align-top'
  | 'tabler:lasso'
  | 'tabler:layers-intersect-2'
  | 'tabler:line-dashed'
  | 'tabler:line-dotted'
  | 'tabler:link'
  | 'tabler:link-off'
  | 'tabler:list-numbers'
  | 'tabler:lock'
  | 'tabler:lock-open-2'
  | 'tabler:palette'
  | 'tabler:paint'
  | 'tabler:pencil'
  | 'tabler:rectangle'
  | 'tabler:resize'
  | 'tabler:route'
  | 'tabler:select'
  | 'tabler:shape'
  | 'tabler:shadow'
  | 'tabler:shadow-off'
  | 'tabler:square-number-1'
  | 'tabler:square-rounded'
  | 'tabler:squares-diagonal'
  | 'tabler:strikethrough'
  | 'tabler:template'
  | 'tabler:text-color'
  | 'tabler:text-size'
  | 'tabler:underline';

const CURRENT_TABLER_ICON_DATA = {
  'tabler:align-left-2': {
    width: 24,
    height: 24,
    body:
      '<path fill="none" stroke="currentColor" stroke-linecap="round" ' +
      'stroke-linejoin="round" stroke-width="2" d="M4 4v16M8 6h12M8 12h6m-6 6h10"/>',
  },
  'tabler:align-right-2': {
    width: 24,
    height: 24,
    body:
      '<path fill="none" stroke="currentColor" stroke-linecap="round" ' +
      'stroke-linejoin="round" stroke-width="2" d="M20 4v16M4 6h12m-6 6h6M6 18h10"/>',
  },
  'tabler:background': {
    width: 24,
    height: 24,
    body:
      '<path fill="none" stroke="currentColor" stroke-linecap="round" ' +
      'stroke-linejoin="round" stroke-width="2" d="m4 8l4-4m6 0L4 14m0 6L20 4m0 6L10 20m10-4l-4 4"/>',
  },
  'tabler:border-corner-rounded': {
    width: 24,
    height: 24,
    body:
      '<path fill="none" stroke="currentColor" stroke-linecap="round" ' +
      'stroke-linejoin="round" stroke-width="2" d="M7 17v-6a4 4 0 0 1 4-4h6"/>',
  },
  'tabler:border-corner-square': {
    width: 24,
    height: 24,
    body:
      '<path fill="none" stroke="currentColor" stroke-linecap="round" ' +
      'stroke-linejoin="round" stroke-width="2" d="M7 17V7h10"/>',
  },
} satisfies Partial<Record<TablerIconName, IconifyIconData>>;

const TABLER_ICON_DATA: Record<TablerIconName, IconifyIconData> = {
  'tabler:align-center': alignCenterIcon,
  'tabler:align-justified': alignJustifiedIcon,
  'tabler:align-left-2': CURRENT_TABLER_ICON_DATA['tabler:align-left-2'],
  'tabler:align-right-2': CURRENT_TABLER_ICON_DATA['tabler:align-right-2'],
  'tabler:arrow-autofit-width': arrowAutofitWidthIcon,
  'tabler:arrow-curve-right': arrowCurveRightIcon,
  'tabler:arrow-forward': arrowForwardIcon,
  'tabler:arrow-iteration': arrowIterationIcon,
  'tabler:arrow-up-right': arrowUpRightIcon,
  'tabler:arrows-right-left': arrowsRightLeftIcon,
  'tabler:background': CURRENT_TABLER_ICON_DATA['tabler:background'],
  'tabler:blur': blurIcon,
  'tabler:bold': boldIcon,
  'tabler:border-corner-rounded': CURRENT_TABLER_ICON_DATA['tabler:border-corner-rounded'],
  'tabler:border-corner-square': CURRENT_TABLER_ICON_DATA['tabler:border-corner-square'],
  'tabler:border-outer': borderOuterIcon,
  'tabler:border-radius': borderRadiusIcon,
  'tabler:bucket': bucketIcon,
  'tabler:bucket-droplet': bucketDropletIcon,
  'tabler:bucket-off': bucketOffIcon,
  'tabler:color-filter': colorFilterIcon,
  'tabler:color-picker': colorPickerIcon,
  'tabler:contrast-filled': contrastIcon,
  'tabler:diamond': diamondIcon,
  'tabler:dots-vertical': dotsVerticalIcon,
  'tabler:eraser': eraserIcon,
  'tabler:italic': italicIcon,
  'tabler:layout-align-bottom': layoutAlignBottomIcon,
  'tabler:layout-align-center': layoutAlignCenterIcon,
  'tabler:layout-align-top': layoutAlignTopIcon,
  'tabler:lasso': lassoIcon,
  'tabler:layers-intersect-2': layersIntersect2Icon,
  'tabler:line-dashed': lineDashedIcon,
  'tabler:line-dotted': lineDottedIcon,
  'tabler:link': linkIcon,
  'tabler:link-off': linkOffIcon,
  'tabler:list-numbers': listNumbersIcon,
  'tabler:lock': lockIcon,
  'tabler:lock-open-2': lockOpenIcon,
  'tabler:palette': paletteIcon,
  'tabler:paint': paintIcon,
  'tabler:pencil': pencilIcon,
  'tabler:rectangle': rectangleIcon,
  'tabler:resize': resizeIcon,
  'tabler:route': routeIcon,
  'tabler:select': selectIcon,
  'tabler:shape': shapeIcon,
  'tabler:shadow': shadowIcon,
  'tabler:shadow-off': shadowOffIcon,
  'tabler:square-number-1': squareNumber1Icon,
  'tabler:square-rounded': squareRoundedIcon,
  'tabler:squares-diagonal': squaresDiagonalIcon,
  'tabler:strikethrough': strikethroughIcon,
  'tabler:template': templateIcon,
  'tabler:text-color': textColorIcon,
  'tabler:text-size': textSizeIcon,
  'tabler:underline': underlineIcon,
};

function getTablerIconData(icon: TablerIconName): IconifyIconData {
  return TABLER_ICON_DATA[icon];
}

export function TablerIcon(props: {
  className?: string;
  color?: string;
  icon: TablerIconName;
  opacity?: number;
  size?: number;
  style?: CSSProperties;
}) {
  const size = props.size ?? 15;
  const optionalProps = {
    ...(props.className === undefined ? {} : { className: props.className }),
    ...(props.color === undefined ? {} : { color: props.color }),
  };

  return (
    <Icon
      aria-hidden="true"
      height={size}
      icon={getTablerIconData(props.icon)}
      style={{ opacity: props.opacity, ...props.style }}
      width={size}
      {...optionalProps}
    />
  );
}
