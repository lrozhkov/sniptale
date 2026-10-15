import { el } from './dom.js';
function inline(node, text, base) {
  const re = /\[([^\]]+)\]\(([^)]+)\)/g;
  let cursor = 0;
  for (const match of text.matchAll(re)) {
    node.append(text.slice(cursor, match.index));
    const url = new URL(match[2], base);
    if (['http:', 'https:'].includes(url.protocol))
      node.append(el('a', { href: url.href, text: match[1] }));
    else node.append(match[1]);
    cursor = match.index + match[0].length;
  }
  node.append(text.slice(cursor));
}
export function renderMarkdown(text, root, base) {
  let list = null,
    table = null;
  for (const line of text.split('\n')) {
    if (!line.trim()) {
      list = null;
      table = null;
      continue;
    }
    if (line.startsWith('|')) {
      if (/^\|[\s:|—-]+\|$/.test(line)) continue;
      const cells = line
        .split('|')
        .slice(1, -1)
        .map((x) => x.trim());
      if (!table) {
        table = el('table');
        root.append(el('div', { class: 'rule-table-scroll' }, table));
        const row = el('tr');
        for (const cell of cells) {
          const th = el('th');
          inline(th, cell, base);
          row.append(th);
        }
        table.append(row);
      } else {
        const row = el('tr');
        for (const cell of cells) {
          const td = el('td');
          inline(td, cell, base);
          row.append(td);
        }
        table.append(row);
      }
      continue;
    }
    table = null;
    const heading = line.match(/^(#{1,6}) (.+)/);
    if (heading) {
      const node = el('h' + heading[1].length);
      inline(node, heading[2], base);
      root.append(node);
      list = null;
      continue;
    }
    const item = line.match(/^[-*] (.+)|^\d+\. (.+)/);
    if (item) {
      if (!list) {
        list = el(item[2] ? 'ol' : 'ul');
        root.append(list);
      }
      const li = el('li');
      inline(li, item[1] || item[2], base);
      list.append(li);
      continue;
    }
    list = null;
    const p = el('p');
    inline(p, line, base);
    root.append(p);
  }
}
