// Inline SVG icons. Always decorative (aria-hidden): every icon sits next to a word that says
// the same thing, so screen readers hear the word once and nothing else.
// 24 x 24 grid, 2px strokes, square-ish joins: plain shapes that stay legible when enlarged.

const PATHS = {
  home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/>',
  activity: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  pay: '<path d="M4 12h14"/><path d="m13 6 6 6-6 6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14"/><path d="M12 17.5v.01"/>',
  settings: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  cross: '<path d="M6 6l12 12M18 6 6 18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  question: '<path d="M9 9a3 3 0 1 1 4.2 2.8c-.8.4-1.2 1-1.2 1.8V15"/><path d="M12 18.5v.01"/>',
  warning: '<path d="M12 4 2.5 20h19L12 4Z"/><path d="M12 10v4.5M12 17.5v.01"/>',
  fingerprint: '<path d="M7 18c1-2 1.5-4 1.5-6a3.5 3.5 0 0 1 7 0c0 2.5-.4 5-1.5 7.5"/><path d="M12 12c0 3-.7 5.5-2 8"/><path d="M4.5 15c.3-1 .5-2 .5-3a7 7 0 0 1 14 0c0 1.5-.1 3-.4 4.5"/>',
  speaker: '<path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
  in: '<path d="M17 7 7 17"/><path d="M7 9v8h8"/>',
  out: '<path d="M7 17 17 7"/><path d="M9 7h8v8"/>',
  shield: '<path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z"/>',
  ear: '<path d="M7 9a5 5 0 1 1 10 0c0 3-3 4-3 7a3 3 0 0 1-5.5 1.5"/><path d="M10 9a2 2 0 1 1 4 0"/>',
};

export const icon = (name, cls = 'icon') =>
  `<svg class="${cls}" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${PATHS[name]}</svg>`;

/** The WAYMARK mark: a trail blaze pointing the way. Colours come from CSS (--blaze, --accent). */
export const mark = (cls = 'mark') =>
  `<svg class="${cls}" viewBox="0 0 32 32" width="32" height="32" aria-hidden="true" focusable="false"><rect width="32" height="32" rx="3" class="mark__blaze"/><path d="M9 21.5 16 10l7 11.5" class="mark__arrow" fill="none" stroke-width="4" stroke-linecap="square" stroke-linejoin="miter"/></svg>`;
