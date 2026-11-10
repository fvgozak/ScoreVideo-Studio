/* HEX-first color editors. Swatches remain native; editable #RRGGBB fields
   are the primary visible values on all operating systems. */
(function (root) {
  'use strict';
  const six = /^#?[\da-fA-F]{6}$/;
  const three = /^#?[\da-fA-F]{3}$/;
  function normalizeHex(value) {
    const raw = String(value ?? '').trim();
    const body = raw.replace(/^#/, '');
    if (six.test(raw)) return '#' + body.toUpperCase();
    if (three.test(raw)) return '#' + [...body].map(ch => ch + ch).join('').toUpperCase();
    return null;
  }
  function enhance(input) {
    if (!input || input.dataset.hexEnhanced === 'true') return null;
    if (!input.id) return null;
    input.dataset.hexEnhanced = 'true';
    const host = document.createElement('div');
    host.className = 'hex-picker';
    const value = document.createElement('input');
    value.type = 'text';
    value.className = 'hex-value';
    value.dataset.hexTextFor = input.id;
    value.setAttribute('aria-label', input.closest('label')?.textContent?.trim() + ' HEX 값' || input.id + ' HEX 값');
    value.setAttribute('autocomplete', 'off');
    value.setAttribute('spellcheck', 'false');
    value.setAttribute('autocapitalize', 'characters');
    value.setAttribute('maxlength', '7');
    value.setAttribute('placeholder', '#RRGGBB');
    input.parentNode.insertBefore(host, input);
    host.appendChild(input);
    host.appendChild(value);
    const sync = () => {
      if (document.activeElement !== value) value.value = String(input.value).toUpperCase();
      value.classList.remove('invalid');
      value.setAttribute('aria-invalid', 'false');
    };
    input.addEventListener('input', sync);
    input.addEventListener('change', sync);
    value.addEventListener('input', () => {
      const normalized = normalizeHex(value.value);
      value.classList.toggle('invalid', !normalized);
      value.setAttribute('aria-invalid', normalized ? 'false' : 'true');
      if (normalized && input.value.toLowerCase() !== normalized.toLowerCase()) {
        input.value = normalized;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    value.addEventListener('blur', () => {
      const normalized = normalizeHex(value.value);
      if (normalized) {
        value.value = normalized;
      } else {
        value.value = String(input.value).toUpperCase();
      }
      value.classList.remove('invalid');
      value.setAttribute('aria-invalid', 'false');
    });
    value.value = String(input.value).toUpperCase();
    return {input, value, sync};
  }
  function setup() {
    for (const input of document.querySelectorAll('input[type="color"]')) enhance(input);
    syncAll();
  }
  function syncAll() {
    for (const value of document.querySelectorAll('[data-hex-text-for]')) {
      if (document.activeElement === value) continue;
      const input = document.getElementById(value.dataset.hexTextFor);
      if (input) value.value = String(input.value).toUpperCase();
    }
  }
  root.ScoreHexControls = {normalizeHex, enhance, setup, syncAll};
})(typeof window === 'undefined' ? globalThis : window);
if (typeof module !== 'undefined') module.exports = globalThis.ScoreHexControls;
