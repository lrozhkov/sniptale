import { describe, expect, it } from 'vitest';
import {
  CONTEXT_MENU_ITEMS,
  createContextMenuLayout,
  createRecommendedContextMenuSettings,
  parseContextMenuLayout,
} from './context-menu-layout';

describe('context menu layout boundary', () => {
  it('round trips a complete section layout and returns isolated defaults', () => {
    const layout = createContextMenuLayout();
    layout.sections = [
      { id: 'tools', title: '<Tools>', items: ['showSettings'] },
      { id: 'root', title: '', items: CONTEXT_MENU_ITEMS.filter((key) => key !== 'showSettings') },
    ];
    expect(parseContextMenuLayout(JSON.parse(JSON.stringify(layout)))).toEqual(layout);
    layout.sections[0]!.items.length = 0;
    expect(createContextMenuLayout().sections[0]?.items).toHaveLength(9);
    expect(createRecommendedContextMenuSettings()).toMatchObject({
      showImageEditor: false,
      showVideoEditor: false,
      showWindowResize: false,
      showScreenshots: true,
    });
  });
  it.each([
    null,
    {},
    { version: 2, sections: [] },
    { version: 1, sections: [] },
    { ...createContextMenuLayout(), extra: true },
    { version: 1, sections: [{ id: 'root', title: '', items: [] }] },
    {
      version: 1,
      sections: [{ id: 'root', title: '', items: [...CONTEXT_MENU_ITEMS, 'showSettings'] }],
    },
    {
      version: 1,
      sections: [{ id: 'root', title: '', items: [...CONTEXT_MENU_ITEMS.slice(1), 'unknown'] }],
    },
    { version: 1, sections: [{ id: 'root', title: 'wrong', items: [...CONTEXT_MENU_ITEMS] }] },
    {
      version: 1,
      sections: [
        { id: 'root', title: '', items: [...CONTEXT_MENU_ITEMS] },
        { id: 'root', title: '', items: [] },
      ],
    },
    { version: 1, sections: [{ id: 'other', title: 'Other', items: [...CONTEXT_MENU_ITEMS] }] },
    ...['', ' ', ' padded', 'control\nname', 'a'.repeat(41)].map((title) => ({
      version: 1,
      sections: [...createContextMenuLayout().sections, { id: 'tools', title, items: [] }],
    })),
    {
      version: 1,
      sections: [
        ...createContextMenuLayout().sections,
        ...Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, title: 'Tools', items: [] })),
      ],
    },
  ])('rejects malformed or ambiguous layout %#', (value) => {
    expect(parseContextMenuLayout(value)).toBeNull();
  });
});
