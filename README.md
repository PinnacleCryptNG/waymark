# WAYMARK

An accessible banking prototype for blind and low-vision customers, built for Zenith Bank Zecathon 6.0, Challenge #7: Inclusive Digital Banking for Diverse Accessibility Needs.

**Demo only.** Every name, account number and amount is invented. No real bank is connected and no real money moves. This is an independent prototype, not a Zenith Bank service. Never enter real credentials.

## The idea: hear who you pay

A blind customer can pay a brand-new account number privately and confidently, with no sighted help:

- **Name check before paying.** Type a 10-digit account number and choose a bank. WAYMARK looks up the account name in a fictional directory, reads it once, offers **Spell name**, and asks for a separate confirmation.
- **Lookalike warning.** If the name looks like a saved beneficiary but the number is different, WAYMARK says so before you can continue.
- **Fingerprint approval.** Sign-in and payments are approved with the phone's own fingerprint or face unlock (WebAuthn). Nothing is spoken or typed, so nothing can be overheard. A returning user signs in with one touch. A 4-digit demo pin remains as a fallback; when screen-reader users type it, the keyboard reads each key aloud, so WAYMARK says to use headphones.
- **Voice first, no screen reader needed.** The first screen is one big button: tap anywhere and WAYMARK speaks with the phone's own voice, then listens. Sign-up is spoken from the very start: say your mobile number, say the code, then tap anywhere and confirm with the phone lock (fingerprint, face or phone PIN). After that, say "what is my balance", "send 5,000 naira to Musa" or "pay 0198765432 at Lagoon Bank, 2,000 naira". WAYMARK reads back who, how much, the fee and the total from the bank's own figures; to send, tap anywhere and confirm with the phone lock. "Yes" alone never sends. A tap always interrupts. A rising tone means listening, a falling tone means done. For a new account, WAYMARK reads the owner's name, with any lookalike warning, and continues only on a clear "yes". Voice payments are limited to ₦50,000; "use the screens" switches to the screen-reader path at any time. A returning user taps once and confirms with the phone lock to sign in.
- **Fewer steps.** Saved payees are one-tap "Pay" buttons on Home and Pay. The Review screen opens with one sentence that says who, how much, the fee and the total, followed directly by the approve button. Demo-only controls are collapsed out of the way.
- **Outcomes you can trust.** Completed, Failed, Pending and Outcome unknown are four separate states. Pending and unknown offer **Check status** only, never "send again".
- **Outcome vibrations.** On Android, each outcome has its own vibration pattern alongside the spoken heading.

The full requirements are in the WAYMARK Master PRD v1.0 (`docs/WAYMARK-Master-PRD-v1.0.docx`).

## Run it

WAYMARK now has a server (`backend/`): accounts by phone number, secured by the user's voice. The server also serves the app, so one command runs everything.

Requires Python 3.10+, ffmpeg and Node.js 18+ (for the unit tests).

```sh
python3 -m venv backend-venv
backend-venv/bin/pip install -r backend/requirements.txt
cd backend && ../backend-venv/bin/uvicorn waymark_server.app:app --port 8080   # app + API at http://localhost:8080/

npm test                                        # app unit tests (node --test)
cd backend && ../backend-venv/bin/python -m pytest tests   # server tests
```

The first voice check downloads two open models (about 300 MB) into `backend/models/`: SpeechBrain's ECAPA speaker model (is it the same voice?) and Whisper `base.en` (which numbers were said?). They run on a CPU; a voice check takes about a second.

Settings (environment variables): `WAYMARK_DB` (SQLite file), `WAYMARK_VOICE_THRESHOLD` (default 0.45), `WAYMARK_ENROLL_THRESHOLD` (0.40), `WAYMARK_CORS_ORIGINS` (comma-separated, when the app is hosted elsewhere, such as GitHub Pages; then set `API_BASE` in `app/config.js`).

`npm start` still serves `app/` on its own, but without the server nobody can sign in.

To try it on a phone with TalkBack or VoiceOver, run `npm start` on a computer and open `http://<computer's LAN address>:8080/` on a phone on the same Wi-Fi. Or host the `app/` folder on any static host, such as GitHub Pages.

### Demo values

| Step | Value |
| --- | --- |
| Mobile number | Any Nigerian mobile number, for example 0803 123 4567. No code: the first person to register a number owns it |
| Voice set-up | Say the 5 random numbers WAYMARK reads out, three times |
| Sign-in and approval | Say 5 fresh random numbers; the server checks the voice and the numbers |
| New account, plain | 0198765432 at Lagoon Bank (demo) → Chinedu Eze |
| New account, lookalike warning | 5009988776 at Kola Microfinance (demo) → Adaeze Okafur |

All values are also printed on screen where they are needed.

On the Review screen, **Demo bank behaviour** decides how the demo bank and network behave for that one transfer, so every path can be shown:

| Choice | What happens | Result |
| --- | --- | --- |
| Normal | The bank completes it | Transfer completed |
| The bank declines it | No money moves | Transfer failed |
| The bank holds it as pending | The bank accepts it but has not finished | Transfer pending; Check status completes it |
| The connection drops after sending | The bank completes it, but its reply never arrives; the app gives up after 6 seconds | Outcome unknown; Check status finds it completed |

A real app would not have this choice.

### 90-second demo script

1. Start the demo, enter any mobile number and code 123456, then choose **Use my phone lock** (J1).
2. On Home, move by heading to Balance: "Demo balance, 245,800 naira" (J2).
3. On Home, choose **Pay a new account** → 5009988776, Kola Microfinance. Hear the lookalike warning. Choose **No, change details**.
4. Enter 0198765432, Lagoon Bank. Hear "Chinedu Eze", try **Spell name**, then **Yes, pay Chinedu Eze** (J3).
5. Enter 245800 to show the over-balance error with the amount kept, then correct it to 5000 (J5).
6. Review: one sentence says who, how much, the fee and the total. Choose **Confirm with phone lock** and confirm with your fingerprint, face or phone PIN. The result is announced and activity updates once (J4).
7. On Home, tap **Pay Musa Ibrahim**, then under **Demo controls for judges** choose **The connection drops after sending**. After 6 seconds with no reply the app says it could not confirm the transfer. The only action is **Check status**, which finds the bank had completed it (J6).

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
| Unit tests, `npm test` (T-01 to T-07, the bank boundary, the voice reader and dialog, the voice assistant, and the Gemini reader and server) | 75 of 75 pass |
| Journeys J1 to J6 in Chromium at 390 px, plus fingerprint sign-in and approval with a virtual authenticator, `checks/journeys.cjs` | 74 of 74 checks pass (including a voice-first journey from first launch: sign-up, fingerprint, payment, with stand-in microphone and voice; and the Gemini reader with a stand-in server) |
| axe-core WCAG 2.0 to 2.2 A/AA rules, every screen, standard and high contrast, `checks/axe.cjs` | 0 violations in 36 scans |
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

## Architecture

```
screens (app/ui)  ──>  bank boundary (app/bank/bank-api.js)  ──>  DemoBank (app/bank/demo-bank.js)
      │                         ▲                                        │
      └── transfer client ──────┘                                        └── ledger, name directory (app/domain)
          (app/bank/transfer-client.js: 6-second timeout, status checks, never resends)
```

- **Screens** never touch money directly. They call the bank boundary and render from a cached copy of the account and activity.
- **The bank boundary** lists everything the app asks of a bank: account, activity, beneficiaries, name lookup, fee quote, submit transfer (with an idempotency key so a repeat never moves money twice) and transfer status.
- **DemoBank** implements that boundary in the browser with realistic delays and four behaviours (normal, decline, hold, drop).
- **The transfer client** sends a transfer and waits up to 6 seconds. No reply, or a network error, means *Outcome unknown*, never *Failed*. The only way forward is a status check with the same transfer id.

Going live means writing a second adapter with the same methods that calls the bank's authorised APIs (for example NIP name enquiry and payment initiation behind a server the bank approves). The screens and the transfer client do not change.

## Voice security

```
sign up:  phone number ─> server picks 5 random digits ─> user says them (x3) ─> voiceprint saved
sign in:  saved number ─> new random digits ─> user says them ─> server: right digits? same voice? ─> session
pay:      bank figures read back ─> tap ─> new digits, tied to this payee, amount and transfer id ─> one-time approval ─> transfer
```

- The browser only records. The server decides: Whisper checks the digits (one slip in five is allowed), and the ECAPA speaker model compares the voice to the voiceprint (cosine similarity, threshold 0.45).
- Random digits each time, used once and valid for 2 minutes, so replaying a recording of an earlier check does not work.
- A payment approval only works for the exact transfer id, payee account and amount it was issued for, once, within 2 minutes. The server refuses transfers without one.
- Five voice sign-ins that do not match lock the account for 15 minutes. Sessions last 30 minutes.
- The server keeps the voiceprint (an average of speaker embeddings), not the recordings.
- Checked with synthetic voices only so far: four different text-to-speech voices scored 0.69–0.77 against themselves and 0.11–0.39 against each other. Real voices on real phone microphones still need testing, and the threshold may need tuning.
- Limits: no code at sign-up means whoever registers a number first owns it, and a good AI copy of someone's voice may pass. A real bank would add an SMS code at sign-up, liveness detection and a second factor for large payments.

## Voice architecture

```
Tap anywhere ─> WAYMARK speaks (speechSynthesis) ─> tone ─> listens (browser speech-to-text)
      │                                                         ▼
      │                          assistant.js: sign-up (phone, voice), voice sign-in, payments  
      │                                 │  interpreter.js reads the words
      │                                 │    today: rules in intent.js, on the phone
      │                                 │    or:    Gemini, via server/gemini-worker.js (holds the key)
      │                                 ▼
      │                          dialog.js decides what to say: answer, ask for the amount or bank,
      │                          read back the owner, or read the payment summary. It never sends money.
      ▼
Tap anywhere + voice check ─> bank boundary ─> outcome spoken from the bank's own figures
```

ui/talk.js handles turn-taking: WAYMARK never listens while it is talking, and a tap stops either at once.

Speech-to-text in Chrome sends audio to Google; Help says so. Both readers return the same request shapes, so the conversation rules do not change.

**Gemini (optional).** `server/gemini-worker.js` is a Cloudflare Worker that holds the Gemini key and asks Gemini what a sentence means, with a fixed JSON schema. Only the sentence and the demo bank names are sent; balances and saved payees stay on the phone, and payee names are matched there. "Yes" and "no" never leave the phone. The answer is checked on the phone before use, and if the server is slow (4 s), down or odd, the rules answer instead. Gemini never moves money. To switch it on, follow [docs/AI-SETUP.md](docs/AI-SETUP.md), then put the Worker address in `app/config.js`. The reader is not tied to Gemini: another provider means changing that one server file.

## Hosting

`.github/workflows/pages.yml` runs the tests and publishes `app/` to GitHub Pages on every push to the default branch. One-time setup in the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**. The demo is then at `https://pinnaclecryptng.github.io/waymark/`.

## Project layout

```
app/
  index.html, styles.css, sw.js, manifest.webmanifest
  bank/     bank boundary, DemoBank, transfer client (timeouts and status checks)
  voice/    assistant, command readers (rules, or Gemini via the server), conversation rules, listening and tones
  config.js where the AI server is (empty: rules only)
server/     Cloudflare Worker that holds the Gemini key
  domain/   money, spoken forms, validation, transfer state machine, ledger, name lookup (pure, no DOM)
  ui/       routing, screens, focus and announcements, haptics, sessionStorage
  data/     fictional seed data
tests/      unit tests (node --test)
checks/     optional browser journey and axe checks
scripts/    zero-dependency static server
docs/       PRD and review (Word)
```

## Design

The design system is described in [docs/DESIGN.md](docs/DESIGN.md). In short:

- **Identity ("Midnight"):** a deep midnight canvas with a slow violet, magenta and amber aurora and faint
  sound rings behind every screen. Amber marks anything you can act on.
- **Type:** Unbounded, a wide geometric face, for headlines and large amounts, and Atkinson Hyperlegible
  Next, made for low-vision readers, for reading text at a 19px base.
- **Talk button:** a glass stage with a glowing voice orb. Each state has its own shape as well as its own
  words: listening rings, violet while speaking, a turning ring while working, amber while waiting for your
  voice check.
- **Start page:** "Banking you can hear." explains the product in about three seconds, while the top of
  the page stays one big tap-to-talk target.
- High contrast mode swaps everything for black, white and yellow, with no gradients.

Both fonts are self-hosted under the SIL Open Font License (`app/fonts/OFL-unbounded.txt`, `app/fonts/OFL-atkinson-next.txt`).

## How it behaves

- Money is integer kobo throughout. The fee is a flat ₦10.00 demo fee.
- One ledger module, inside DemoBank, owns the balance and activity. Submitting the same transfer id twice changes nothing; a double tap on Confirm creates one transfer.
- The ledger and settings are kept in `sessionStorage` for the browser tab. The demo pin is held in memory only. The fingerprint credential's id (not a secret; the key never leaves the phone) is kept in `localStorage` so the next visit offers one-touch sign-in. Without a server, the demo trusts the phone's yes or no; a bank would verify the signed answer on its servers. **Settings → Reset demo** restores the starting data.
- After the first visit, the app works offline (service worker).
- iPhone browsers cannot vibrate, so iOS users get the spoken outcome only.

## Known limits

- Voice sign-in has only been tested with synthetic voices. No KYC, device binding or SMS check of the phone number.
- The server is a prototype (SQLite, one process). Limits and fraud checks are not built yet.
- English only. Yoruba, Hausa, Igbo and Pidgin depend on the phone's text-to-speech voices and need research first.
- Manual screen-reader testing and user research have not been done yet (see the table above).

## Everything that is simulated

The account directory and name enquiry, bank names, balances, transaction history, transfer processing, transfer outcomes and status checks.
