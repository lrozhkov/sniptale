import dictionary, { patterns } from './locale-en.js';
const attributes = ['aria-label', 'aria-valuetext', 'title', 'placeholder'];
export function installLocale(root) {
  const params = new URLSearchParams(location.search),
    language = params.get('lang') === 'en' ? 'en' : 'ru',
    stress = params.get('stress') === '1';
  document.documentElement.lang = language;
  const originals = new WeakMap(),
    attributeRecords = new WeakMap();
  function convert(value, allowStress = true, isStatus = false) {
    const trimmed = value.trim();
    if (!trimmed) return value;
    if (trimmed.startsWith('⟦') && trimmed.endsWith('⟧')) return value;
    let result = trimmed;
    if (language === 'en') {
      const match = isStatus ? patterns.find((item) => item.pattern.test(trimmed)) : null;
      if (match) result = trimmed.replace(match.pattern, match.replacement);
      else if (Object.hasOwn(dictionary, trimmed)) result = dictionary[trimmed];
      else
        for (const item of patterns) {
          if (item.pattern.test(trimmed)) {
            result = trimmed.replace(item.pattern, item.replacement);
            break;
          }
        }
    }
    if (stress && allowStress && /[A-Za-zА-Яа-я]/.test(trimmed) && !/^#[0-9a-f]+$/i.test(trimmed))
      result =
        '⟦' +
        result +
        ' ' +
        (result.length <= 12 ? result : result.slice(0, Math.ceil(result.length * 0.5))) +
        '⟧';
    return (
      value.slice(0, value.indexOf(trimmed)) +
      result +
      value.slice(value.indexOf(trimmed) + trimmed.length)
    );
  }
  function nodeText(node) {
    const value = node.nodeValue,
      record = originals.get(node);
    if (record?.result === value) return;
    const isStatus = !!node.parentElement?.closest('[role=status],[role=alert]'),
      isValue = !!node.parentElement?.closest(
        '.number-unit,.param-value,.curtain-value,.object-meta,.filter-count,.value'
      );
    const result = convert(value, !isStatus && !isValue, isStatus);
    originals.set(node, { source: value, result });
    if (value !== result) node.nodeValue = result;
  }
  function elementAttributes(node) {
    if (node.closest('[data-no-localize]')) return;
    for (const name of attributes) {
      const value = node.getAttribute(name);
      if (value === null) continue;
      const records = attributeRecords.get(node) || new Map();
      attributeRecords.set(node, records);
      if (records.get(name) === value) continue;
      const result = convert(value, name !== 'aria-valuetext');
      records.set(name, result);
      if (result !== value) node.setAttribute(name, result);
    }
    if (node.matches('a[href]')) {
      const url = new URL(node.href, location.href);
      if (url.origin === location.origin && !/\.[a-z]+$/i.test(url.pathname)) {
        if (!url.searchParams.has('lang')) url.searchParams.set('lang', language);
        if (stress) url.searchParams.set('stress', '1');
        node.href = url.href;
      }
    }
  }
  function scan(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!node.parentElement?.closest('script,style,textarea,input,pre,code,[data-no-localize]'))
        nodeText(node);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.closest('[data-no-localize]')) return;
    if (node.matches('script,style,textarea,input')) {
      if (node.matches('input,textarea')) elementAttributes(node);
      return;
    }
    elementAttributes(node);
    for (const child of node.childNodes) scan(child);
  }
  if (language === 'en' || stress) {
    scan(root);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'characterData') scan(record.target);
        else if (record.type === 'attributes') elementAttributes(record.target);
        else for (const node of record.addedNodes) scan(node);
      }
    });
    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: attributes,
    });
  }
  return { language, stress };
}
