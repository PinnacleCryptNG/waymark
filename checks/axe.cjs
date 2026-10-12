// Run axe-core (WCAG 2.0-2.2 A/AA rules) on every screen, in standard and high-contrast modes.
const { chromium } = require('playwright');
const AXE = require('fs').readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const BASE = process.env.BASE_URL || 'http://localhost:8080/';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const at = (t) => page.waitForFunction((x) => document.querySelector('h1')?.textContent.startsWith(x), t, { timeout: 12000 });
  const findings = [];
  async function scan(label) {
    await page.addScriptTag({ content: AXE });
    const r = await page.evaluate(() => axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }));
    for (const v of r.violations) findings.push(`${label}: [${v.impact}] ${v.id} — ${v.help} (${v.nodes.length}) ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' ; ')}`);
    findings.passes = (findings.passes || 0) + r.passes.length; findings.scans = (findings.scans || 0) + 1;
  }

  for (const mode of ['standard', 'high']) {
    await page.goto(BASE + '#welcome');
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await at('Banking you can hear.');
    if (mode === 'high') {
      await page.goto(BASE + '#settings'); await at('Settings');
      await page.getByLabel('High contrast').check();
      await page.goto(BASE + '#welcome'); await at('Banking you can hear.');
    }
    await scan(`${mode}/start-page`);
    await page.goto(BASE + '#start'); await at('Use WAYMARK with the screens');
    await scan(`${mode}/welcome`);
    await page.getByRole('link', { name: 'Start the demo' }).click(); await at('Sign in');
    await page.getByRole('button', { name: 'Continue' }).click();
    await scan(`${mode}/signin-with-error`);
    await page.getByLabel('Mobile number').fill('08000000000');
    await page.getByRole('button', { name: 'Continue' }).click(); await at('Enter your code');
    await scan(`${mode}/otp`);
    await page.getByLabel('Code').fill('123456');
    await page.getByRole('button', { name: 'Continue' }).click(); await at('How do you want');
    await scan(`${mode}/approve-choice`);
    await page.getByRole('link', { name: 'Create a pin' }).click(); await at('Create a demo');
    await scan(`${mode}/create-pin`);
    await page.getByLabel('New demo PIN').fill('2580');
    await page.getByLabel('Enter the demo PIN again').fill('2580');
    await page.getByRole('button', { name: 'Sign in' }).click(); await at('Home');
    await scan(`${mode}/home`);
    await page.goto(BASE + '#activity'); await at('Activity'); await scan(`${mode}/activity`);
    await page.locator('.tx__link').first().click(); await page.waitForTimeout(100); await scan(`${mode}/detail`);
    await page.goto(BASE + '#pay'); await at('Pay someone'); await scan(`${mode}/pay`);
    await page.goto(BASE + '#pay-new'); await at('Pay a new account');
    await page.getByLabel('Account number').fill('5009988776');
    await page.getByLabel('Bank').selectOption('KLA');
    await page.getByRole('button', { name: 'Find account' }).click();
    await page.waitForSelector('#lookup-result');
    await scan(`${mode}/lookup-warning`);
    await page.getByRole('button', { name: /Yes, pay/ }).click(); await at('How much');
    await page.getByRole('button', { name: 'Review transfer' }).click(); await page.waitForSelector('.error-summary');
    await scan(`${mode}/amount-error`);
    await page.getByLabel('Amount in naira').fill('100');
    await page.getByRole('button', { name: 'Review transfer' }).click(); await at('Review transfer');
    await scan(`${mode}/review`);
    await page.getByText('Demo controls for judges').click();
    await scan(`${mode}/review-demo-controls-open`);
    await page.getByLabel('The connection drops after sending').check();
    await page.getByLabel('Demo PIN').fill('2580');
    await page.getByRole('button', { name: 'Confirm transfer' }).click(); await at('We could not');
    await scan(`${mode}/outcome-unknown`);
    await page.goto(BASE + '#talk'); await at('Talk to WAYMARK');
    await page.getByText('Conversation, and typing instead').click();
    await page.getByLabel('Type instead').fill('what is my balance');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('voice-log').innerText.includes('balance is'));
    await scan(`${mode}/voice`);
    await page.goto(BASE + '#help'); await at('Help'); await scan(`${mode}/help`);
    await page.goto(BASE + '#settings'); await at('Settings'); await scan(`${mode}/settings`);
  }
  console.log(findings.length ? findings.join('\n') : 'No axe violations on any screen.', 'scans:', findings.scans, 'rule passes:', findings.passes);
  if (findings.length) process.exitCode = 1;
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
