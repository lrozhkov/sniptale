import { describe, expect, it } from 'vitest';
import { getTemplatePillClasses } from './helpers';

describe('template list item helpers', () => {
  it('builds pill class names from drag, menu, and loading state', () => {
    const classes = getTemplatePillClasses({
      isDragOver: true,
      isDragging: true,
      isLoading: true,
      isMenuOpen: true,
    });

    expect(classes).toContain('menu-open');
    expect(classes).toContain('drag-over');
    expect(classes).toContain('dragging');
    expect(classes).toContain('loading');
  });
});
