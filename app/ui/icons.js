// Inline SVG icons. Always decorative (aria-hidden): every icon sits next to a word that says
// the same thing, so screen readers hear the word once and nothing else.
// 24 x 24 grid, 1.9px rounded strokes. Each menu icon has its own silhouette so none can be mistaken for another.

const PATHS = {
  voice: '<path d="M4 10v4M8 6.5v11M12 3v18M16 7.5v9M20 10v4"/>',
  home: '<path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1Z"/>',
  mic: '<rect x="9" y="2.5" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3.5M8.5 21.5h7"/>',
  activity: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z"/><path d="M9.5 8h5M9.5 12h5M9.5 16h3"/>',
  pay: '<path d="M21 3 10 14"/><path d="M21 3 14.5 21l-4.5-7-7-4.5Z"/>',
  help: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><path d="m5.6 5.6 3.9 3.9M14.5 14.5l3.9 3.9M18.4 5.6l-3.9 3.9M9.5 14.5l-3.9 3.9"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  back: '<path d="m15 5-7 7 7 7"/>',
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
  `<svg class="${cls}" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${PATHS[name]}</svg>`;

/** The WAYMARK mark: five sound bars that form a W, on the brand tile. */
export const mark = (cls = 'mark') =>
  `<svg class="${cls}" viewBox="0 0 40 40" width="40" height="40" aria-hidden="true" focusable="false"><defs><linearGradient id="wm-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4434e0"/><stop offset="1" stop-color="#7b4dff"/></linearGradient></defs><rect width="40" height="40" rx="12" class="mark__tile" fill="url(#wm-grad)"/><g class="mark__bars" fill="#fff"><rect x="6.3" y="11" width="3.4" height="18" rx="1.7"/><rect x="12.3" y="20" width="3.4" height="9" rx="1.7"/><rect x="18.3" y="15" width="3.4" height="14" rx="1.7"/><rect x="24.3" y="20" width="3.4" height="9" rx="1.7"/><rect x="30.3" y="11" width="3.4" height="18" rx="1.7"/></g></svg>`;
