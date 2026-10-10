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
  const at = (t) => page.waitForFunction((x) => document.querySelector('h1')?.textContent === x, t, { timeout: 4000 }).then(() => true, () => false);
  const live = () => page.locator('#live').innerText();

  // J1 sign in
  await page.goto(BASE);
  check('welcome h1', (await h1()) === 'WAYMARK');
  await page.screenshot({ path: OUT + '01-welcome.png', fullPage: true });
  await page.getByRole('link', { name: 'Start the demo' }).click();
  await at('Sign in to the demo');
  check('signin focus on h1', (await focused()).startsWith('H1#page-title'), await focused());
  await page.getByRole('button', { name: 'Continue' }).click();
  check('blank phone error summary focused', (await focused()).includes('error-summary'), await focused());
  check('phone aria-invalid', (await page.locator('#phone').getAttribute('aria-invalid')) === 'true');
  await page.screenshot({ path: OUT + '02-signin-error.png', fullPage: true });
  await page.getByLabel('Phone number').fill('0800 000 0000');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Code').fill('123456');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('New demo PIN').fill('2580');
  await page.getByLabel('Enter the demo PIN again').fill('2580');
  await page.getByRole('button', { name: 'Create PIN and sign in' }).click();

  // J2 orient
  check('home after sign-in', await at('Home'));
  const balText = await page.locator('.balance__amount').innerText();
  const balSr = await page.locator('.balance__amount .sr-only').allInnerTexts();
  const accName = await page.evaluate(() => [...document.querySelector('.balance__amount').childNodes].map(function walk(n){ if(n.nodeType===3) return n.textContent; if(n.getAttribute && n.getAttribute('aria-hidden')==='true') return ''; return [...n.childNodes].map(walk).join(''); }).join(''));
  check('balance spoken form', accName === 'Demo balance, 245,800 naira', accName);
  check('nav current = Home', (await page.locator('[aria-current="page"]').innerText()) === 'Home');
  await page.screenshot({ path: OUT + '03-home.png', fullPage: true });

  // J3 pay a new account, with lookalike warning first
  await page.getByRole('link', { name: 'Pay someone' }).click();
  await page.getByRole('link', { name: /New account/ }).click();
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
  const reviewText = await page.locator('.summary').textContent();
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
  await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Transfer completed', null, { timeout: 5000 });
  check('outcome focus on h1', (await focused()).startsWith('H1#page-title'), await focused());
  const bal = await page.locator('.summary').textContent();
  check('balance debited once', bal.includes('240,790 naira'), '');
  await page.screenshot({ path: OUT + '07-completed.png', fullPage: true });
  await page.getByRole('link', { name: 'View activity' }).click();
  await at('Activity');
  const items = await page.locator('.tx').count();
  check('activity has one new item (7)', items === 7, String(items));
  const firstItem = await page.locator('.tx').first().textContent();
  check('first item reads in order', /Transfer to Chinedu Eze.*10 October 2026.*Debit, 5,000 naira.*Completed/s.test(firstItem.replace(/\s+/g, ' ')), firstItem.replace(/\s+/g, ' ').trim());

  // J6 unknown outcome via saved beneficiary
  await page.getByRole('link', { name: 'Pay', exact: true }).click();
  await page.getByRole('link', { name: /Saved beneficiary/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  check('saved: no selection error', (await page.locator('.error-summary').innerText()).includes('Choose who you want to pay'));
  await page.getByLabel(/Musa Ibrahim/).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Amount in naira').fill('1,000');
  await page.getByRole('button', { name: 'Review transfer' }).click();
  await page.getByLabel('Outcome unknown').check();
  await page.getByLabel('Demo PIN').fill('2580');
  await page.getByRole('button', { name: 'Confirm transfer' }).click();
  await page.waitForFunction(() => document.querySelector('h1')?.textContent.startsWith('We could not confirm'), null, { timeout: 5000 });
  const unknownBtns = await page.locator('main button, main a.button').allInnerTexts();
  check('unknown: no resend control', !unknownBtns.some((t) => /send|try again|confirm/i.test(t)), unknownBtns.join(' | '));
  await page.screenshot({ path: OUT + '08-unknown.png', fullPage: true });
  await page.getByRole('button', { name: 'Check status' }).click();
  await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Transfer completed', null, { timeout: 5000 });
  check('unknown resolved to completed', true);
  await page.getByRole('link', { name: 'Activity', exact: true }).click();
  await at('Activity');
  check('activity 8 items, Musa once', (await page.locator('.tx').count()) === 8 && (await page.locator('.tx', { hasText: 'Transfer to Musa Ibrahim' }).count()) === 2);

  // Cancel flow
  await page.getByRole('link', { name: 'Pay', exact: true }).click();
  await page.getByRole('link', { name: /Saved beneficiary/ }).click();
  await page.getByLabel(/Funke Adeyemi/).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Amount in naira').fill('200');
  await page.getByRole('button', { name: 'Review transfer' }).click();
  await page.getByRole('button', { name: 'Cancel transfer' }).click();
  await at('Transfer cancelled');
  check('cancelled says nothing sent', (await page.locator('main').innerText()).includes('Nothing was sent'));

  // Failed + retry keeps details
  await page.getByRole('link', { name: 'Pay', exact: true }).click();
  await page.getByRole('link', { name: /Saved beneficiary/ }).click();
  await page.getByLabel(/Funke Adeyemi/).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Amount in naira').fill('300');
  await page.getByRole('button', { name: 'Review transfer' }).click();
  await page.getByLabel('Failed').check();
  await page.getByLabel('Demo PIN').fill('2580');
  await page.getByRole('button', { name: 'Confirm transfer' }).click();
  await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Transfer failed', null, { timeout: 5000 });
  await page.getByRole('button', { name: 'Try again' }).click();
  check('retry returns to review with same amount', (await at('Review transfer')) && (await page.locator('.summary').textContent()).includes('300 naira'));

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

  console.log(results.join('\n'));
  if (results.some((r) => r.startsWith('FAIL'))) process.exitCode = 1;
  await browser.close();
})().catch((e) => { console.log(results.join('\n')); console.error(e); process.exit(1); });
