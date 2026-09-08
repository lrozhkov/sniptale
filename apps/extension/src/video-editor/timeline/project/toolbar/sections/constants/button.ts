const toolbarControlSizeClassName = [
  '!h-9 !min-w-9',
  '@max-[1400px]/timeline:!h-8 @max-[1400px]/timeline:!min-w-8',
  '@max-[1000px]/timeline:!h-7 @max-[1000px]/timeline:!min-w-6',
].join(' ');

export const toolbarButtonClassName = [
  toolbarControlSizeClassName,
  '!w-auto gap-1 !px-1.5 text-[13px] @max-[1400px]/timeline:text-[12px]',
].join(' ');
export const toolbarIconButtonClassName = [
  toolbarControlSizeClassName,
  '!w-9 !px-0 @max-[1400px]/timeline:!w-8 @max-[1000px]/timeline:!w-6',
].join(' ');

export const toolbarExportButtonClassName = toolbarButtonClassName;
