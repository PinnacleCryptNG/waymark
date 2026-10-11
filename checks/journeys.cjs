// Drives journeys J1 to J6 in Chromium and checks focus, spoken text and ledger results.
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:8080/';
const OUT = __dirname + '/screenshots/';
const results = [];
const check = (name, cond, extra = '') => { results.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };

(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const focused = () => page.evaluate(() => {
    const a = document.activeElement; return `${a.tagName}#${a.id} "${(a.textContent || '').trim().slice(0, 60)}"`;
  });
  const h1 = () => page.locator('h1').innerText();
  const at = (t) => page.waitForFunction((x) => document.querySelector('h1')?.textContent === x, t, { timeout: 10000 }).then(() => true, () => false);
  const live = () => page.locator('#live').innerText();
  const payTo = async (name) => {
    await page.getByRole('link', { name: 'Pay', exact: true }).click();
    await at('Pay someone');
    await page.getByRole('button', { name: new RegExp(`^Pay ${name}`) }).click();
    await at(`How much to send to ${name}?`);
  };
  const demoBehaviour = async (label) => {
    const open = await page.locator('details.demo-switch').evaluate((d) => d.open);
    if (!open) await page.getByText('Demo controls for judges').click();
    await page.getByLabel(label).check();
  };

  // J1 sign in
  await page.goto(BASE);
  check('first screen is Talk', (await h1()) === 'WAYMARK' && (await page.locator('#talk-btn').count()) === 1);
  check('first screen focus on the talk target', (await focused()).startsWith('BUTTON#talk-btn'), await focused());
  await page.screenshot({ path: OUT + '00-talk.png', fullPage: true });
  await page.getByRole('link', { name: 'Use the screens instead' }).click();
  await page.waitForFunction(() => location.hash === '#start');
  check('screens start h1', (await h1()) === 'WAYMARK');
  await page.screenshot({ path: OUT + '01-welcome.png', fullPage: true });
  await page.getByRole('link', { name: 'Start the demo' }).click();
  await at('Sign in to the demo');
  check('signin focus on h1', (await focused()).startsWith('H1#page-title'), await focused());
  await page.getByRole('button', { name: 'Continue' }).click();
  check('blank phone error summary focused', (await focused()).includes('error-summary'), await focused());
  check('phone aria-invalid', (await page.locator('#phone').getAttribute('aria-invalid')) === 'true');
  await page.screenshot({ path: OUT + '02-signin-error.png', fullPage: true });
  await page.getByLabel('Mobile number').fill('12345');
  await page.getByRole('button', { name: 'Continue' }).click();
  check('invalid phone rejected', (await page.locator('.error-summary').innerText()).includes('11-digit Nigerian mobile number'));
  await page.getByLabel('Mobile number').fill('+234 803 123 4567');
  await page.getByRole('button', { name: 'Continue' }).click();
  await at('Enter your code');
  check('otp shows number ending', (await page.locator('main').innerText()).includes('ending 4567'));
  await page.getByLabel('Code').fill('123456');
  await page.getByRole('button', { name: 'Continue' }).click();
  check('approval choice screen', await at('How do you want to approve payments?'));
  await page.getByRole('link', { name: 'Create a pin' }).click();
  await at('Create a demo PIN');
  check('pin field spoken as a word', (await page.locator('#pin1').getAttribute('aria-label')) === 'New demo pin');
  await page.getByLabel('New demo PIN').fill('2580');
  await page.getByLabel('Enter the demo PIN again').fill('2580');
  await page.getByRole('button', { name: 'Sign in' }).click();

  // J2 orient
  check('home after sign-in', await at('Home'));
  const balText = await page.locator('.balance__amount').innerText();
  const balSr = await page.locator('.balance__amount .sr-only').allInnerTexts();
  const accName = await page.evaluate(() => [...document.querySelector('.balance__amount').childNodes].map(function walk(n){ if(n.nodeType===3) return n.textContent; if(n.getAttribute && n.getAttribute('aria-hidden')==='true') return ''; return [...n.childNodes].map(walk).join(''); }).join(''));
  check('balance spoken form', accName === 'Demo balance, 245,800 naira', accName);
  check('nav current = Home', (await page.locator('[aria-current="page"]').innerText()) === 'Home');
  await page.screenshot({ path: OUT + '03-home.png', fullPage: true });

  // J3 pay a new account, with lookalike warning first
  await page.getByRole('link', { name: 'Pay a new account' }).click();
  await at('Pay a new account');
  await page.getByLabel('Account number').fill('5009988776');
  await page.getByLabel('Bank').selectOption('KLA');
  await page.getByRole('button', { name: 'Find account' }).click();
  await page.waitForSelector('#lookup-result');
  check('lookalike warning shown', (await page.locator('#lookup-result').innerText()).includes('This is not your saved Adaeze Okafor'));
  check('focus moved to result', (await focused()).includes('lookup-result'), await focused());
  await page.screenshot({ path: OUT + '04-lookalike.png', fullPage: true });
  await page.getByRole('button', { name: 'No, change details' }).click();
  check('focus back on account field', (await focused()).startsWith('INPUT#account'), await focused());
  await page.getByLabel('Account number').fill('0198765432');
  await page.getByLabel('Bank').selectOption('LGN');
  await page.getByRole('button', { name: 'Find account' }).click();
  await page.waitForSelector('#lookup-result');
  check('found Chinedu Eze', (await page.locator('.payee-name').innerText()) === 'Chinedu Eze');
  await page.getByRole('button', { name: 'Spell name' }).click();
  await page.waitForTimeout(150);
  check('spelled announced', (await live()) === 'C, H, I, N, E, D, U, space, E, Z, E', await live());
  await page.getByRole('button', { name: 'Yes, pay Chinedu Eze' }).click();
  check('amount h1', await at('How much to send to Chinedu Eze?'));

  // J5 recover from over-balance
  await page.getByLabel('Amount in naira').fill('245800');
  await page.getByRole('button', { name: 'Review transfer' }).click();
  check('over-balance error', (await page.locator('.error-summary').innerText()).includes('more than your demo balance'));
  check('amount kept after error', (await page.getByLabel('Amount in naira').inputValue()) === '245800');
  await page.screenshot({ path: OUT + '05-amount-error.png', fullPage: true });
  await page.getByLabel('Amount in naira').fill('5000');
  await page.getByLabel(/Note for the recipient/).fill('Rent share');
  await page.getByRole('button', { name: 'Review transfer' }).click();

  // J4 review, PIN, confirm (double click)
  check('review h1', await at('Review transfer'));
  const reviewText = await page.locator('#review-summary').textContent();
  check('review summary is one sentence with payee', reviewText.includes('Chinedu Eze') && reviewText.includes('Nothing has been sent yet'));
  check('review total spoken', reviewText.includes('5,010 naira'), '');
  check('review account ending spoken', reviewText.includes('account ending 5 4 3 2'));
  await page.screenshot({ path: OUT + '06-review.png', fullPage: true });
  await page.getByLabel('Demo PIN').fill('1111');
  await page.getByRole('button', { name: 'Confirm transfer' }).click();
  check('wrong PIN error', (await page.locator('.error-summary').innerText()).includes('PIN is not correct'));
  await page.getByLabel('Demo PIN').fill('2580');
  const btn = page.getByRole('button', { name: 'Confirm transfer' });
  await btn.click();
  await page.evaluate(() => { const b = document.getElementById('confirm-btn'); b.click(); b.click(); document.querySelector('form[data-form="confirm"]').requestSubmit(); });
  await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Transfer completed', null, { timeout: 12000 });
  check('outcome focus on h1', (await focused()).startsWith('H1#page-title'), await focused());
  const bal = await page.locator('.summary').textContent();
  check('balance debited once', bal.includes('240,790 naira'), '');
  await page.screenshot({ path: OUT + '07-completed.png', fullPage: true });
  await page.getByRole('link', { name: 'View activity' }).click();
  await at('Activity');
  const items = await page.locator('.tx').count();
  check('activity has one new item (7)', items === 7, String(items));
  const firstItem = await page.locator('.tx').first().textContent();
  check('first item reads in order', /Transfer to Chinedu Eze.*\d{1,2} [A-Z][a-z]+ 2026.*Debit, 5,000 naira.*Completed/s.test(firstItem.replace(/\s+/g, ' ')), firstItem.replace(/\s+/g, ' ').trim());

  // J6 unknown outcome via a one-tap saved payee
  await payTo('Musa Ibrahim');
  await page.getByLabel('Amount in naira').fill('1,000');
  await page.getByRole('button', { name: 'Review transfer' }).click();
  await at('Review transfer');
  await demoBehaviour('The connection drops after sending');
  await page.getByLabel('Demo PIN').fill('2580');
  await page.getByRole('button', { name: 'Confirm transfer' }).click();
  await page.waitForFunction(() => document.querySelector('h1')?.textContent.startsWith('We could not confirm'), null, { timeout: 12000 });
  const unknownBtns = await page.locator('main button, main a.button').allInnerTexts();
  check('unknown: no resend control', !unknownBtns.some((t) => /send|try again|confirm/i.test(t)), unknownBtns.join(' | '));
  await page.screenshot({ path: OUT + '08-unknown.png', fullPage: true });
  await page.getByRole('button', { name: 'Check status' }).click();
  await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Transfer completed', null, { timeout: 12000 });
  check('unknown resolved to completed', true);
  await page.getByRole('link', { name: 'Activity', exact: true }).click();
  await at('Activity');
  check('activity 8 items, Musa once', (await page.locator('.tx').count()) === 8 && (await page.locator('.tx', { hasText: 'Transfer to Musa Ibrahim' }).count()) === 2);

  // Cancel flow
  await payTo('Funke Adeyemi');
  await page.getByLabel('Amount in naira').fill('200');
  await page.getByRole('button', { name: 'Review transfer' }).click();
  await at('Review transfer');
  await page.getByRole('button', { name: 'Cancel transfer' }).click();
  await at('Transfer cancelled');
  check('cancelled says nothing sent', (await page.locator('main').innerText()).includes('Nothing was sent'));

  // Cancelling while the fee quote is loading must not jump to Review afterwards
  await payTo('Funke Adeyemi');
  await page.getByLabel('Amount in naira').fill('200');
  await page.evaluate(() => {
    document.querySelector('form[data-form="amount"]').requestSubmit();
    document.querySelector('[data-action="cancel-transfer"]').click();
  });
  await page.waitForTimeout(800);
  check('late quote ignored after cancel', (await h1()) === 'Transfer cancelled', await h1());

  // Failed + retry keeps details
  await payTo('Funke Adeyemi');
  await page.getByLabel('Amount in naira').fill('300');
  await page.getByRole('button', { name: 'Review transfer' }).click();
  await at('Review transfer');
  await demoBehaviour('The bank declines it');
  await page.getByLabel('Demo PIN').fill('2580');
  await page.getByRole('button', { name: 'Confirm transfer' }).click();
  await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Transfer failed', null, { timeout: 12000 });
  await page.getByRole('button', { name: 'Try again' }).click();
  check('retry returns to review with same amount', (await at('Review transfer')) && (await page.locator('#review-summary').textContent()).includes('300 naira'));

  // Pending: bank holds it, status check completes it. Starts from the Home "Pay again" button.
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await at('Home');
  await page.getByRole('button', { name: /^Pay Adaeze Okafor/ }).click();
  check('home one-tap pay', await at('How much to send to Adaeze Okafor?'));
  await page.getByLabel('Amount in naira').fill('750');
  await page.getByRole('button', { name: 'Review transfer' }).click();
  await at('Review transfer');
  await demoBehaviour('The bank holds it as pending');
  await page.getByLabel('Demo PIN').fill('2580');
  await page.getByRole('button', { name: 'Confirm transfer' }).click();
  check('hold shows pending', await at('Transfer pending'));
  const pendingBtns = await page.locator('main button, main a.button').allInnerTexts();
  check('pending: no resend control', !pendingBtns.some((t) => /send|try again|confirm/i.test(t)), pendingBtns.join(' | '));
  await page.getByRole('button', { name: 'Check status' }).click();
  check('pending resolves to completed', await at('Transfer completed'));

  // Settings
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Extra large').check();
  await page.getByLabel('High contrast').check();
  await page.waitForTimeout(150);
  check('settings announced', (await live()).includes('High contrast on'), await live());
  await page.screenshot({ path: OUT + '09-settings-hc.png', fullPage: true });
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await page.screenshot({ path: OUT + '10-home-hc-xl.png', fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  check('no sideways scroll at 390px, XL text', !overflow);

  // Reflow at 320px (200% zoom equivalent)
  await page.setViewportSize({ width: 320, height: 640 });
  await page.getByRole('link', { name: 'Activity', exact: true }).click();
  await at('Activity');
  await page.screenshot({ path: OUT + '11-activity-320.png', fullPage: true });
  const wide = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1).slice(0,5).map(e => e.tagName + '.' + e.className + ' ' + Math.round(e.getBoundingClientRect().right)));
  check('no sideways scroll at 320px', !(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)), wide.join(', '));

  // Refresh keeps ledger, requires sign-in
  await page.reload();
  check('refresh requires sign-in', (await h1()) === 'WAYMARK');
  check('no JS errors', errors.length === 0, errors.join(' || '));

  // Fingerprint journey, with Chrome's virtual authenticator standing in for the sensor
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const fp = await ctx.newPage();
  fp.on('pageerror', (e) => errors.push(String(e)));
  const cdp = await ctx.newCDPSession(fp);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: {
    protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true,
    isUserVerified: true, automaticPresenceSimulation: true } });
  const fpAt = (t) => fp.waitForFunction((x) => document.querySelector('h1')?.textContent === x, t, { timeout: 10000 }).then(() => true, () => false);
  await fp.goto(BASE + '#start');
  await fp.getByRole('link', { name: 'Start the demo' }).click();
  await fp.getByLabel('Mobile number').fill('08031234567');
  await fp.getByRole('button', { name: 'Continue' }).click();
  await fp.getByLabel('Code').fill('123456');
  await fp.getByRole('button', { name: 'Continue' }).click();
  await fpAt('How do you want to approve payments?');
  await fp.screenshot({ path: OUT + '12-approve-choice.png', fullPage: true });
  await fp.getByRole('button', { name: 'Use my fingerprint' }).click();
  check('fingerprint set-up signs in', await fpAt('Home'));
  check('fingerprint flash', (await fp.locator('.flash').innerText()).includes('fingerprint'));
  await fp.getByRole('button', { name: /^Pay Musa Ibrahim/ }).click();
  await fpAt('How much to send to Musa Ibrahim?');
  await fp.getByLabel('Amount in naira').fill('500');
  await fp.getByRole('button', { name: 'Review transfer' }).click();
  await fpAt('Review transfer');
  check('fingerprint review has no PIN field', (await fp.locator('#pin').count()) === 0);
  await fp.screenshot({ path: OUT + '13-review-fingerprint.png', fullPage: true });
  await cdp.send('WebAuthn.setUserVerified', { authenticatorId, isUserVerified: false });
  await fp.getByRole('button', { name: 'Confirm with fingerprint' }).click();
  await fp.waitForSelector('.error-summary', { timeout: 10000 }).catch(() => {});
  check('failed fingerprint sends nothing', (await fp.locator('h1').innerText()) === 'Review transfer'
    && (await fp.locator('.error-summary').innerText()).includes('Nothing was sent'));
  await cdp.send('WebAuthn.setUserVerified', { authenticatorId, isUserVerified: true });
  await fp.getByRole('button', { name: 'Confirm with fingerprint' }).click();
  check('fingerprint approves transfer', await fpAt('Transfer completed'));
  await fp.reload();
  await fp.goto(BASE + '#start');
  await fpAt('WAYMARK');
  await fp.getByRole('button', { name: 'Sign in with fingerprint' }).click();
  check('one-touch sign-in on return', await fpAt('Home'));
  await ctx.close();
  check('no JS errors in fingerprint journey', errors.length === 0, errors.join(' || '));

  // Voice-first journey: no screen reader. Stand-ins for the microphone (a queue of things
  // the user "says") and the phone's voice (records what WAYMARK says), plus a virtual sensor.
  const vctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await vctx.addInitScript(() => {
    window.__queue = [];
    window.__spoken = [];
    // Chrome exposes both names; replace both so the stand-in is used.
    window.SpeechRecognition = window.webkitSpeechRecognition = class {
      start() {
        const next = window.__queue.shift();
        // Nothing queued: stay "listening" until the next tap aborts it.
        if (next !== undefined) setTimeout(() => { this.onresult?.({ results: [[{ transcript: next }]] }); this.onend?.(); }, 50);
      }
      stop() {}
      abort() {}
    };
    Object.defineProperty(window, 'speechSynthesis', { value: {
      speak(u) { window.__spoken.push(u.text); setTimeout(() => u.onend?.(), 20); },
      cancel() {}, getVoices: () => [],
    } });
  });
  const vp = await vctx.newPage();
  vp.on('pageerror', (e) => errors.push(String(e)));
  const vcdp = await vctx.newCDPSession(vp);
  await vcdp.send('WebAuthn.enable');
  await vcdp.send('WebAuthn.addVirtualAuthenticator', { options: {
    protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true,
    isUserVerified: true, automaticPresenceSimulation: true } });
  const said = () => vp.evaluate(() => window.__spoken.join('\n'));
  const waitSaid = (text) => vp.waitForFunction((t) => window.__spoken.some((x) => x.includes(t)), text, { timeout: 8000 })
    .then(() => true, () => false);
  const say = (...lines) => vp.evaluate((l) => window.__queue.push(...l), lines);
  const tapAnywhere = () => vp.mouse.click(195, 400);

  await vp.goto(BASE);
  check('voice: first screen is one big tap target', (await vp.locator('#talk-btn').boundingBox()).height > 400);
  await say('zero eight zero three one two three four five six seven', 'one two three four five six');
  await tapAnywhere();
  check('voice: welcome spoken on first tap', await waitSaid('Welcome to WAYMARK'));
  check('voice: phone read back, code spoken', await waitSaid('the code is 1 2 3 4 5 6'));
  check('voice: asks for a tap and fingerprint', await waitSaid('touch your fingerprint sensor'));
  await vp.waitForFunction(() => document.getElementById('talk-status').textContent.includes('fingerprint'));
  await vp.screenshot({ path: OUT + '14-voice-signup.png', fullPage: true });
  await say('send 500 naira to Musa');
  await tapAnywhere();
  check('voice: signed up by voice and fingerprint', await waitSaid("You're all set"));
  check('voice: stays on Talk after sign-in', (await vp.evaluate(() => location.hash)) === '#talk');
  check('voice: payment summary spoken', await waitSaid('Send 500 naira to Musa Ibrahim, Savanna Bank (demo), account ending 8 8 4 6. The fee is 10 naira'));
  await vp.waitForFunction(() => document.getElementById('talk-status').textContent.includes('fingerprint'));
  await tapAnywhere();
  check('voice: tap and fingerprint sends', await waitSaid('Done. 500 naira sent to Musa Ibrahim'));
  check('voice: new balance spoken', (await said()).includes('Your balance is now 245,290 naira'));

  // Typing instead uses the same conversation.
  await vp.getByText('Conversation, and typing instead').click();
  const typeIn = async (text, expect) => {
    await vp.getByLabel('Type instead').fill(text);
    await vp.getByRole('button', { name: 'Send', exact: true }).click();
    return waitSaid(expect);
  };
  check('voice: balance answered in words', await typeIn('what is my balance', 'Your demo balance is 245,290 naira.'));
  check('voice: account owner read back', await typeIn('pay 0198765432 at Lagoon bank 2000 naira', 'That account belongs to Chinedu Eze'));
  check('voice: no cancels', await typeIn('no', 'Okay, cancelled. Nothing was sent.'));
  check('voice: lookalike warning spoken', await typeIn('send 1000 to 5009988776 kola microfinance', 'Careful. This is not your saved Adaeze Okafor'));
  await typeIn('no', 'Nothing was sent');
  check('voice: limit enforced', await typeIn('send 60000 to Musa', 'Voice payments are limited to 50,000 naira'));
  check('voice: conversation shown on screen', (await vp.locator('#voice-log').innerText()).includes('Done. 500 naira sent'));
  await vp.screenshot({ path: OUT + '15-voice-conversation.png', fullPage: true });

  // Returning user: one tap and a fingerprint.
  await vp.reload();
  await vp.evaluate(() => { window.__spoken = []; });
  await tapAnywhere();
  check('voice: welcome back on return', await waitSaid('Welcome back'));
  await vp.waitForFunction(() => document.getElementById('talk-status').textContent.includes('fingerprint'));
  await tapAnywhere();
  check('voice: one-tap sign-in on return', await waitSaid("You're signed in"));
  await vctx.close();
  check('no JS errors in voice journey', errors.length === 0, errors.join(' || '));

  console.log(results.join('\n'));
  if (results.some((r) => r.startsWith('FAIL'))) process.exitCode = 1;
  await browser.close();
})().catch((e) => { console.log(results.join('\n')); console.error(e); process.exit(1); });
