import { glassPopoverToolbarFormColorStyles } from './toolbar-form-color-styles.data.ts';
import { glassPopoverToolbarFormInputStyles } from './toolbar-form-input-styles.data.ts';
import { glassPopoverToolbarFormLayoutStyles } from './toolbar-form-layout-styles.data.ts';

export const glassPopoverToolbarFormStyles = [
  glassPopoverToolbarFormLayoutStyles,
  glassPopoverToolbarFormInputStyles,
  glassPopoverToolbarFormColorStyles,
].join('\n');
