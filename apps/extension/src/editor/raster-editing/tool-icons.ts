import arrowsMaximizeIcon from '@iconify-icons/tabler/arrows-maximize';
import brushIcon from '@iconify-icons/tabler/brush';
import circleIcon from '@iconify-icons/tabler/circle';
import linkIcon from '@iconify-icons/tabler/link';
import colorSwatchIcon from '@iconify-icons/tabler/color-swatch';
import contrastIcon from '@iconify-icons/tabler/contrast';
import opacityIcon from '@iconify-icons/tabler/droplet-half-2';
import bucketDropletIcon from '@iconify-icons/tabler/bucket-droplet';
import cropIcon from '@iconify-icons/tabler/crop';
import eraserIcon from '@iconify-icons/tabler/eraser';
import lassoIcon from '@iconify-icons/tabler/lasso';
import squareDashedIcon from '@iconify-icons/tabler/square-dashed';
import wandIcon from '@iconify-icons/tabler/wand';

// Match the other tool silhouettes without enlarging the outline weight.
const normalizedCropIcon = {
  ...cropIcon,
  body:
    '<g fill="none" stroke="currentColor" stroke-linecap="round" ' +
    'stroke-linejoin="round" stroke-width="2">' +
    '<path d="M7 3v13a1 1 0 0 0 1 1h13"/><path d="M3 7h13a1 1 0 0 1 1 1v13"/></g>',
};

const magicEraserIcon = {
  ...eraserIcon,
  body:
    eraserIcon.body +
    '<path fill="none" stroke="currentColor" stroke-linecap="round" ' +
    'stroke-linejoin="round" stroke-width="2" ' +
    'd="M6 3l.85 2.15L9 6l-2.15.85L6 9l-.85-2.15L3 6l2.15-.85Z"/>',
};

const restoreBrushIcon = {
  ...brushIcon,
  body:
    brushIcon.body +
    '<path fill="none" stroke="currentColor" stroke-linecap="round" ' +
    'stroke-linejoin="round" stroke-width="2" d="M15 18h6m-3-3v6"/>',
};

/** Canonical local outline artwork shared by raster tool buttons and their canvas cursors. */
export const rasterToolIcons = {
  brush: brushIcon,
  select: squareDashedIcon,
  fill: bucketDropletIcon,
  'remove-color': magicEraserIcon,
  erase: eraserIcon,
  restore: restoreBrushIcon,
  crop: normalizedCropIcon,
};

/** Keep selection-method artwork identical in the property strip and cursor feedback. */
export const rasterSelectionIcons = {
  rectangle: squareDashedIcon,
  lasso: lassoIcon,
  wand: wandIcon,
};

/** Outline property cues; translated labels remain authoritative for numeric parameter meaning. */
export const rasterParameterIcons = {
  tolerance: colorSwatchIcon,
  grow: arrowsMaximizeIcon,
  brushSize: circleIcon,
  hardness: contrastIcon,
  opacity: opacityIcon,
  contiguous: linkIcon,
};
