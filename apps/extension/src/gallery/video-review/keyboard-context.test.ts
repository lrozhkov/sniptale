// @vitest-environment jsdom
import { expect, it } from 'vitest';
import {
  focusReviewRegion,
  reviewKeyboardTarget,
  reviewOwnsKeys,
  reviewOwnsPlaybackKeys,
} from './keyboard-context';

it('keeps editor shortcuts inactive while the initial mode choice owns the dialog', () => {
  const editor = document.createElement('div');
  editor.dataset['ui'] = 'gallery.videoReview.dialog';
  const chooser = document.createElement('section');
  chooser.dataset['ui'] = 'gallery.videoReview.modeChoice';
  const button = document.createElement('button');
  chooser.append(button);
  editor.append(chooser);
  expect(reviewKeyboardTarget({ target: button })).toBeNull();
  expect(reviewKeyboardTarget({ target: editor })).toBeNull();
  chooser.remove();
  editor.append(button);
  expect(reviewKeyboardTarget({ target: button })).toBe(button);
});

it('limits editor keys to its surface and yields to open layers including native dialogs', () => {
  const editor = document.createElement('div');
  editor.dataset['ui'] = 'gallery.videoReview.dialog';
  const control = document.createElement('button');
  editor.append(control);
  document.body.append(editor);
  try {
    expect(reviewKeyboardTarget({ target: document.body })).toBeNull();
    expect(reviewKeyboardTarget({ target: control })).toBe(control);
    for (const role of ['dialog', 'alertdialog', 'menu', 'listbox']) {
      const layer = document.createElement('div');
      layer.setAttribute('role', role);
      editor.append(layer);
      expect(reviewKeyboardTarget({ target: control })).toBeNull();
      layer.hidden = true;
      expect(reviewKeyboardTarget({ target: control })).toBe(control);
      layer.remove();
    }
    const dialog = document.createElement('dialog');
    editor.append(dialog);
    expect(reviewKeyboardTarget({ target: control })).toBe(control);
    dialog.open = true;
    expect(reviewKeyboardTarget({ target: control })).toBeNull();
  } finally {
    editor.remove();
  }
});

it('cycles regions in both directions while preserving each region’s local controls', () => {
  const editor = document.createElement('div');
  editor.dataset['ui'] = 'gallery.videoReview.dialog';
  const regions = ['previewFrame', 'timeline', 'inspector'].map((name) => {
    const region = document.createElement('div');
    region.dataset['ui'] = `gallery.videoReview.${name}`;
    const button = document.createElement('button');
    if (name === 'timeline') button.dataset['ui'] = 'gallery.videoReview.timePlane';
    region.append(button);
    editor.append(region);
    return button;
  });
  document.body.append(editor);
  try {
    for (const index of [0, 1, 2]) {
      expect(focusReviewRegion(regions[index]!, false)).toBe(true);
      expect(document.activeElement).toBe(regions[(index + 1) % 3]);
      expect(focusReviewRegion(regions[index]!, true)).toBe(true);
      expect(document.activeElement).toBe(regions[(index + 2) % 3]);
    }
    expect(focusReviewRegion(editor, true)).toBe(true);
    expect(document.activeElement).toBe(regions[2]);
  } finally {
    editor.remove();
  }
});

it('preserves input, composite and resize control ownership', () => {
  for (const role of [
    'textbox',
    'combobox',
    'spinbutton',
    'separator',
    'slider',
    'tablist',
    'radiogroup',
    'tree',
  ]) {
    const control = document.createElement('div');
    control.setAttribute('role', role);
    expect(reviewOwnsKeys(control)).toBe(true);
  }
  const field = document.createElement('div');
  field.setAttribute('contenteditable', 'true');
  const child = document.createElement('span');
  field.append(child);
  expect(reviewOwnsKeys(child)).toBe(true);
});

it('reserves playback Space for command surfaces while preserving editing and open widgets', () => {
  for (const type of ['text', 'number', 'checkbox', 'radio']) {
    const input = document.createElement('input');
    input.type = type;
    expect(reviewOwnsPlaybackKeys(input)).toBe(true);
  }
  const toggle = document.createElement('button');
  toggle.setAttribute('role', 'switch');
  expect(reviewOwnsPlaybackKeys(toggle)).toBe(true);
  const lane = document.createElement('button');
  lane.dataset['reviewTrackSelect'] = '';
  const label = document.createElement('span');
  lane.append(label);
  expect(reviewOwnsPlaybackKeys(label)).toBe(true);
  expect(reviewOwnsKeys(label)).toBe(false);
  const slider = document.createElement('input');
  slider.type = 'range';
  expect(reviewOwnsPlaybackKeys(slider)).toBe(false);
  const trigger = document.createElement('button');
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  expect(reviewOwnsPlaybackKeys(trigger)).toBe(false);
  trigger.setAttribute('aria-expanded', 'true');
  expect(reviewOwnsPlaybackKeys(trigger)).toBe(true);
});
