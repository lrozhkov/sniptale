export function bindFieldLabel(label, input) {
  // Parameter names identify the editor without forwarding pointer activation.
  label.removeAttribute('for');
  if (!label.id) label.id = input.id + '-label';
  input.setAttribute('aria-labelledby', label.id);
}
