import { expect, it } from 'vitest';
import type { CompactCommand } from '../../inspector/compact';
import { createToolPropertiesGroups } from './tool-properties-groups';
import {
  createToolbarGroup,
  parseToolbarPercent,
  parseToolbarPixel,
} from './toolbar-group-builders';

function command(id: string, value?: string): CompactCommand {
  return {
    content: <div>{id}</div>,
    id,
    title: id,
    trigger: id,
    ...(value === undefined ? {} : { value }),
  };
}

it('groups generic current tool commands by template, color, size, and remaining settings', () => {
  const groups = createToolPropertiesGroups([
    command('shape-template'),
    command('shape-fill-color'),
    command('shape-width', '4px'),
    command('shape-dynamic-width'),
  ]);
  expect(groups.map((group) => group.id)).toEqual(['templates', 'color', 'size', 'settings']);
});

it('builds non-empty groups and parses toolbar values defensively', () => {
  expect(
    createToolbarGroup({
      commands: [],
      id: 'empty',
      kind: 'geometry',
      title: 'Empty',
      trigger: 'E',
    })
  ).toBeNull();
  expect(parseToolbarPercent('45%')).toBe(0.45);
  expect(parseToolbarPercent('invalid')).toBe(1);
  expect(parseToolbarPercent('150%')).toBe(1);
  expect(parseToolbarPixel('12.5px')).toBe(12.5);
  expect(parseToolbarPixel(undefined)).toBe(0);
});
