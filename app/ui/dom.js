// Small helpers for building accessible markup and managing focus and announcements.

import { formatNaira } from '../domain/money.js';
import { spokenNaira, spokenDirectionAmount } from '../domain/spoken.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/** Visible text for sighted users, exact spoken text for screen readers. */
export const dual = (visible, spoken) =>
  `<span aria-hidden="true">${esc(visible)}</span><span class="sr-only">${esc(spoken)}</span>`;

export const money = (kobo) => `<span class="amt">${dual(formatNaira(kobo), spokenNaira(kobo))}</span>`;

export const signedMoney = (direction, kobo) =>
  `<span class="amt">${dual(`${direction === 'debit' ? '−' : '+'}${formatNaira(kobo)}`, spokenDirectionAmount(direction, kobo))}</span>`;

/** Polite announcement for in-place changes that do not move focus. */
export function announce(message) {
  const region = document.getElementById('live');
  if (!region) return;
  region.textContent = '';
  // A short gap makes screen readers treat a repeated message as new.
  setTimeout(() => { region.textContent = message; }, 60);
}

export function focusElement(el) {
  if (!el) return;
  if (!el.hasAttribute('tabindex') && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) {
    el.setAttribute('tabindex', '-1');
  }
  el.focus({ preventScroll: true });
  // Scroll only if the element starts off screen, so a page that already shows it does not jump.
  const { top } = el.getBoundingClientRect();
  if (top < 0 || top > window.innerHeight * 0.8) el.scrollIntoView({ block: 'start', behavior: 'auto' });
}

/** Error summary at the top of a form. Each entry is { field, message }. */
export function errorSummary(errors) {
  if (!errors?.length) return '';
  return `<div class="error-summary" id="error-summary" tabindex="-1" aria-labelledby="error-summary-title">
    <h2 id="error-summary-title">There ${errors.length === 1 ? 'is a problem' : `are ${errors.length} problems`}</h2>
    <ul>${errors.map((e) => `<li><button type="button" class="link" data-action="focus-field" data-field="${esc(e.field)}">${esc(e.message)}</button></li>`).join('')}</ul>
  </div>`;
}

/**
 * A labelled text input with optional hint and error, wired with aria-describedby and aria-invalid.
 * The visible label is the accessible name, so voice-control commands match what is on screen.
 */
export function textField({ id, label, hint, error, value = '', type = 'text', inputmode, autocomplete = 'off', required = true, extra = '' }) {
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ');
  return `<div class="field${error ? ' field--error' : ''}">
    <label for="${id}">${esc(label)}${required ? '' : ' <span class="optional">(optional)</span>'}</label>
    ${hint ? `<p class="hint" id="${id}-hint">${hint}</p>` : ''}
    ${error ? `<p class="field-error" id="${id}-error"><span class="sr-only">Error: </span>${esc(error)}</p>` : ''}
    <input id="${id}" name="${id}" type="${type}" value="${esc(value)}"
      ${inputmode ? `inputmode="${inputmode}"` : ''} autocomplete="${autocomplete}"
      ${required ? 'aria-required="true"' : ''} ${error ? 'aria-invalid="true"' : ''}
      ${describedBy ? `aria-describedby="${describedBy}"` : ''} spellcheck="false" ${extra}>
  </div>`;
}

export const errorFor = (errors, field) => errors?.find((e) => e.field === field)?.message;
