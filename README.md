# WAYMARK

An accessible banking prototype for blind and low-vision customers, built for Zenith Bank Zecathon 6.0, Challenge #7: Inclusive Digital Banking for Diverse Accessibility Needs.

**Demo only.** Every name, account number and amount is invented. No real bank is connected and no real money moves. This is an independent prototype, not a Zenith Bank service. Never enter real credentials.

## The idea: hear who you pay

A blind customer can pay a brand-new account number privately and confidently, with no sighted help:

- **Name check before paying.** Type a 10-digit account number and choose a bank. WAYMARK looks up the account name in a fictional directory, reads it once, offers **Spell name**, and asks for a separate confirmation.
- **Lookalike warning.** If the name looks like a saved beneficiary but the number is different, WAYMARK says so before you can continue.
- **Private PIN entry.** The PIN uses the phone's own secure text field, so TalkBack and VoiceOver do not read the digits. WAYMARK announces only "2 of 4 digits entered".
- **Outcomes you can trust.** Completed, Failed, Pending and Outcome unknown are four separate states. Pending and unknown offer **Check status** only, never "send again".
- **Outcome vibrations.** On Android, each outcome has its own vibration pattern alongside the spoken heading.

The full requirements are in the WAYMARK Master PRD v1.0 (`docs/WAYMARK-Master-PRD-v1.0.docx`).

## Run it

Requires Node.js 18 or later. There is nothing to install.

```sh
npm start          # serves the app at http://localhost:8080/
npm test           # unit tests (node --test), no dependencies
```

Browsers do not load JavaScript modules from `file://`, so open the app through `npm start` (or any static server pointed at `app/`) rather than double-clicking `index.html`.

To try it on a phone with TalkBack or VoiceOver, run `npm start` on a computer and open `http://<computer's LAN address>:8080/` on a phone on the same Wi-Fi. Or host the `app/` folder on any static host, such as GitHub Pages.

### Demo values

| Step | Value |
| --- | --- |
| Phone number | 0800 000 0000 |
| Code | 123456 |
| PIN | Any 4 digits you choose at sign-in |
| New account, plain | 0198765432 at Lagoon Bank (demo) → Chinedu Eze |
| New account, lookalike warning | 5009988776 at Kola Microfinance (demo) → Adaeze Okafur |

All values are also printed on screen where they are needed.

On the Review screen, the **Demo outcome** choice decides what the demo bank answers (Completed, Failed, Pending or Outcome unknown), so every path can be shown. A real app would not have this choice.

### 90-second demo script

1. Start the demo and sign in with the values above (J1).
2. On Home, move by heading to Balance: "Demo balance, 245,800 naira" (J2).
3. Pay someone → New account → 5009988776, Kola Microfinance. Hear the lookalike warning. Choose **No, change details**.
4. Enter 0198765432, Lagoon Bank. Hear "Chinedu Eze", try **Spell name**, then **Yes, pay Chinedu Eze** (J3).
5. Enter 245800 to show the over-balance error with the amount kept, then correct it to 5000 (J5).
6. Review, enter the PIN, **Confirm transfer**. The result is announced and activity updates once (J4).
7. Pay again with **Demo outcome: Outcome unknown**. The only action is **Check status**, which resolves the transfer to Completed (J6).

## Accessibility

Target: WCAG 2.2 AA. What is in place:

- Native HTML controls only: labels, fieldsets, radios, select, buttons. No custom widgets.
- One H1 per screen; focus moves to it on every screen change. Errors move focus to an error summary linked to each field.
- Exact spoken forms for money, masked accounts, references and dates (for example "account ending 4 7 1 9", not "star star star").
- No time limits anywhere. The demo code does not expire.
- Visible labels match accessible names, so voice-control commands work.
- Text size (up to 150%), high contrast and reduced motion settings. Layout reflows to 320 px with no sideways scrolling.
- Nothing sensitive is spoken automatically.

### What has been checked

| Check | Result |
| --- | --- |
| Unit tests, `npm test` (T-01 to T-07) | 27 of 27 pass |
| Journeys J1 to J6 in Chromium at 390 px, `checks/journeys.cjs` | 34 of 34 checks pass |
| axe-core WCAG 2.0 to 2.2 A/AA rules, every screen, standard and high contrast, `checks/axe.cjs` | 0 violations in 30 scans |
| TalkBack on a low-cost Android phone (T-08) | **Not yet done** |
| VoiceOver on iPhone (T-09), NVDA on desktop (T-10) | **Not yet done** |
| Testing with blind and low-vision users | **Not yet done** |

Automated checks do not prove accessibility. Manual screen-reader testing and sessions with blind and low-vision testers are still needed before any compliance claim.

The browser checks are optional and need Playwright and axe-core, which the app itself does not use:

```sh
npm start &
npm install --no-save playwright axe-core
npx playwright install chromium
node checks/journeys.cjs
node checks/axe.cjs
```

## Project layout

```
app/
  index.html, styles.css, sw.js, manifest.webmanifest
  domain/   money, spoken forms, validation, transfer state machine, ledger, name lookup (pure, no DOM)
  ui/       routing, screens, focus and announcements, haptics, sessionStorage
  data/     fictional seed data
tests/      unit tests (node --test)
checks/     optional browser journey and axe checks
scripts/    zero-dependency static server
docs/       PRD and review (Word)
```

## How it behaves

- Money is integer kobo throughout. The fee is a flat ₦10.00 demo fee.
- One ledger module owns the balance and activity. Submitting the same operation twice changes nothing; a double tap on Confirm creates one transfer.
- The ledger and settings are kept in `sessionStorage` for the browser tab. The demo PIN is held in memory only, so refreshing the page asks you to sign in again. **Settings → Reset demo** restores the starting data.
- After the first visit, the app works offline (service worker).
- iPhone browsers cannot vibrate, so iOS users get the spoken outcome only.

## Known limits

- No real authentication, KYC, liveness check or device binding. Sign-in is simulated.
- No server: limits, fraud checks and idempotency would need to be enforced server-side in production.
- English only. Yoruba, Hausa, Igbo and Pidgin depend on the phone's text-to-speech voices and need research first.
- Manual screen-reader testing and user research have not been done yet (see the table above).

## Everything that is simulated

Sign-in, the one-time code, the PIN, the account directory and name enquiry, bank names, balances, transaction history, transfer processing, transfer outcomes and status checks.
