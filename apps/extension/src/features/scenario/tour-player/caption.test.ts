// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { createTourCaption } from './caption.js';

function fixture() {
  const hint = document.createElement('aside');
  const text = document.createElement('div');
  const toggle = document.createElement('button');
  const title = document.createElement('span');
  const close = document.createElement('button');
  toggle.dataset['tourHintToggle'] = '';
  title.dataset['tourHintTitle'] = '';
  close.dataset['tourHintClose'] = '';
  toggle.append(title);
  hint.append(toggle, text, close);
  document.body.append(hint);
  hint.style.borderRadius = '14px';
  text.style.lineHeight = '20px';
  let measuredHeight = 20;
  Object.defineProperty(text, 'scrollHeight', { get: () => measuredHeight });
  const lifetime = new AbortController();
  let current = { id: 'first', text: 'Short', label: '' };
  const render = () => {
    hint.hidden = false;
    caption.prepare(current, 'caption-bottom');
    text.textContent = current.text;
    text.style.maxHeight = '160px';
    caption.finish();
  };
  const caption = createTourCaption(
    hint,
    text,
    {
      expand: 'Expand explanation',
      collapse: 'Collapse explanation',
      details: 'Details',
    },
    render,
    lifetime.signal
  );
  return {
    hint,
    text,
    toggle,
    title,
    render,
    caption,
    setCopy(id: string, copy: string, height: number) {
      current = { id, text: copy, label: '' };
      measuredHeight = height;
      render();
    },
    dispose() {
      lifetime.abort();
      hint.remove();
    },
  };
}

it('discloses measured multiline copy without hiding or changing the full text', () => {
  const f = fixture();
  try {
    f.render();
    expect(f.toggle.hidden).toBe(true);
    expect(f.title.hidden).toBe(true);
    expect(f.hint.style.borderRadius).toBe('14px');
    const full = 'First line\nSecond line';
    f.setCopy('long', full, 40);
    expect(f.toggle.hidden).toBe(false);
    expect(f.toggle.getAttribute('aria-label')).toBe('Expand explanation: Details');
    expect(f.hint.dataset['collapsed']).toBe('true');
    expect(f.text.hidden).toBe(false);
    expect(f.text.textContent).toBe(full);
    f.toggle.click();
    expect(f.toggle.getAttribute('aria-expanded')).toBe('true');
    expect(f.toggle.getAttribute('aria-label')).toBe('Collapse explanation: Details');
    f.render();
    expect(f.hint.dataset['collapsed']).toBe('false');
    f.toggle.click();
    expect(f.hint.dataset['collapsed']).toBe('true');
    expect(f.text.textContent).toBe(full);
  } finally {
    f.dispose();
  }
});

it('omits empty annotations and resets disclosure only for another explanation or scene', () => {
  const f = fixture();
  try {
    f.setCopy('empty', '', 0);
    expect(f.hint.hidden).toBe(true);
    f.setCopy('first', 'First\nSecond', 40);
    f.toggle.click();
    f.setCopy('second', 'Third\nFourth', 40);
    expect(f.hint.dataset['collapsed']).toBe('true');
    f.toggle.click();
    f.caption.reset();
    f.render();
    expect(f.hint.dataset['collapsed']).toBe('true');
    f.setCopy('short', 'Short', 20);
    expect(f.toggle.hidden).toBe(true);
    expect(f.hint.hidden).toBe(false);
  } finally {
    f.dispose();
  }
});

it('retains a visible title for the shared long-caption presentation', () => {
  const f = fixture();
  try {
    f.setCopy('long', 'First line\nSecond line', 40);
    expect(f.title.hidden).toBe(false);
    expect(f.title.textContent).toBe('Details');
    expect(f.hint.dataset['collapsed']).toBe('true');
  } finally {
    f.dispose();
  }
});

it('opens long copy from its area while independent actions retain their own behavior', () => {
  const f = fixture();
  try {
    f.setCopy('long', 'First line\nSecond line', 40);
    const action = document.createElement('button');
    action.textContent = 'Next';
    let calls = 0;
    action.addEventListener('click', () => calls++);
    f.hint.append(action);
    action.click();
    expect(calls).toBe(1);
    expect(f.hint.dataset['collapsed']).toBe('true');
    f.text.click();
    expect(f.hint.dataset['collapsed']).toBe('false');
    expect(f.text.textContent).toBe('First line\nSecond line');
    f.toggle.click();
    expect(f.hint.dataset['collapsed']).toBe('true');
  } finally {
    f.dispose();
  }
});

it('keeps an audio-only explanation available without a needless text disclosure', () => {
  const f = fixture();
  try {
    const voice = document.createElement('button');
    voice.dataset['tourNarration'] = 'voice';
    voice.textContent = 'Play';
    f.hint.append(voice);
    f.setCopy('voice', '', 0);
    expect(f.hint.hidden).toBe(false);
    expect(f.toggle.hidden).toBe(true);
    voice.hidden = true;
    f.render();
    expect(f.hint.hidden).toBe(true);
  } finally {
    f.dispose();
  }
});
