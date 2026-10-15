export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value);
  }
  for (const child of [children].flat(Infinity)) {
    if (child !== null && child !== undefined)
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}
export function paramRow(label, value, attrs = {}) {
  return el('div', { class: 'param-row', ...attrs }, [
    el('span', { class: 'param-name', text: label }),
    el('span', { class: 'param-value', text: value }),
  ]);
}
export function exampleCase(meta, children) {
  return el('section', { class: 'reference-case', 'data-case': meta.id }, [
    el('h3', { text: meta.title }),
    ...children,
  ]);
}
