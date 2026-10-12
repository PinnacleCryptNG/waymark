# WAYMARK design system

## Product

- **Audience:** blind and low-vision Nigerians on low-cost Android phones, often outdoors, often zoomed or
  using large text. The sighted people beside them (family, bank staff, judges) are a secondary audience.
- **Purpose:** pay anyone and know exactly who you are paying, without handing your phone to someone else.
- **Primary actions:** talk to WAYMARK (the Talk screen) and pay someone.

## References

These are the patterns the design draws on:

| Reference | What WAYMARK takes from it |
| --- | --- |
| GOV.UK Design System | Yellow focus state with a dark edge; error summary; one thing per page; plain words |
| Be My Eyes and Seeing AI | One large primary action for people who cannot see the screen |
| Monzo, Kuda, Moniepoint | Balance first on Home; people and transactions as list rows, not cards |
| Braille Institute (Atkinson Hyperlegible) | A typeface built so similar letters and digits cannot be confused |
| Trail waymarks (painted blazes) | The identity: a yellow blaze that says "this way" |

## Visual direction

- **Identity:** a waymark is a painted blaze that tells walkers "this way". The logo is a yellow blaze
  with a chevron. Yellow appears only where it carries a signal:
  - the mark;
  - the current menu item;
  - focus;
  - the "touch your fingerprint now" state;
  - the line beside the payment summary.
- **Colour:** deep green `#0e4d37` for actions and the balance, warm paper `#f7f5ef` behind, and near-black
  ink. Status colours are always paired with a word and a shape.
  - Every text colour meets WCAG AA. Body text and actions are at 7:1 or higher.
  - High contrast mode swaps the whole palette for black, white and yellow.
- **Type:** Atkinson Hyperlegible, 18px body, self-hosted (about 35 KB).
  - Its slashed zero and distinct I, l and 1 are deliberate. They matter most in account numbers and
    references.
- **Shape:** small radii (4 to 6px). No gradients, glass or decorative shadows.
  - People and transactions are rows on a rule, not stacks of rounded cards.
- **Imagery:** functional icons only (24px grid, 2px stroke). They are always hidden from screen readers
  and always next to a word.

## Tokens (`app/styles.css`, `:root`)

| Group | Tokens |
| --- | --- |
| Colour | `--bg`, `--surface`, `--surface-2`, `--ink`, `--muted`, `--rule`, `--rule-strong`, `--accent`, `--accent-strong`, `--accent-soft`, `--blaze`, `--focus`, `--ok`, `--bad`, `--wait` (each with `-soft`) |
| Type | `--text-sm` 15px, `--text-md` 18px, `--text-lg` 20px, `--text-xl` 24px, `--text-2xl` 28 to 36px fluid, `--text-3xl` 40 to 60px fluid |
| Space | `--s1` to `--s7`: 4, 8, 12, 16, 24, 32, 48px |
| Size | `--control` 48px minimum control height; `--measure` 40rem reading column; `--wide` 68rem |

## Components

- **Buttons:**
  - Variants: primary (green), secondary (outlined), danger.
  - States: hover darkens, press nudges down 1px, and busy shows a spinner and blocks repeat taps.
  - Icons sit before the label.
- **Focus:** a 3px yellow ring with a 3px dark edge, so it shows on paper, green and yellow alike.
  - On links it is a yellow highlight with a dark underline.
  - Never removed, except on headings that receive focus only for screen readers.
- **Forms:** 2px ink border, 48px tall, error summary at the top, and a red left rule on fields with errors.
- **Lists:** people (initials tile, name, bank and last four digits, chevron) and transactions (direction
  arrow, description, date, amount, status). The whole row is the target, and hover tints it.
- **Status:** an icon and a word (check, cross, clock, question), in the status colour.
- **Talk button:** fills most of the screen. Each state has its own shape as well as its own words:

  | State | What it looks like |
  | --- | --- |
  | Idle | Microphone |
  | Listening | Pulsing ring |
  | Speaking | Moving bars |
  | Working | Turning ring |
  | Waiting for a fingerprint | Whole button turns yellow, with a fingerprint icon |

  With reduced motion the rings stop moving but stay visible.
- **Outcome band:** a coloured left rule, an icon disc, the status word, then the heading.

## Layout

- **Phones:**
  - one column;
  - the menu is one row of six (icon over word);
  - below 360px, or with Large or Extra large text, the menu becomes two rows of three.
- **832px and wider:** the brand and the menu share one bar.
- **896px and wider:** Home splits into two columns, with the balance and people on the left and recent
  activity on the right. Reading order is unchanged.
- **Checked:** at 320, 390 and 1280px; at Standard and Extra large text; in high contrast; and with
  keyboard only. The automated checks in `checks/` cover the no-sideways-scroll rule and axe.
