// Shared helpers for GNCl Playwright tests

function randomDepartureDate() {
  const weeksAhead = 2 + Math.floor(Math.random() * 5); // 2–6 weeks
  const d = new Date();
  d.setDate(d.getDate() + weeksAhead * 7);
  return d;
}

function randomPassenger() {
  const firstNames = ['James','Oliver','Emily','Sophie','Harry','Charlotte','George','Isabella','Jack','Amelia'];
  const lastNames  = ['Smith','Johnson','Williams','Brown','Jones','Taylor','Wilson','Davies','Evans','Thomas'];
  const streets    = ['High Street','Church Lane','Victoria Road','Park Avenue','Station Road','Mill Lane'];
  const cities     = ['London','Manchester','Birmingham','Leeds','Bristol','Edinburgh','Cardiff'];
  const postcodes  = ['SW1A 1AA','M1 1AE','B1 1BB','LS1 1BA','BS1 1AB','EH1 1YZ','CF10 1EP'];

  const first    = firstNames[Math.floor(Math.random() * firstNames.length)];
  const last     = lastNames[Math.floor(Math.random() * lastNames.length)];
  const cityIdx  = Math.floor(Math.random() * cities.length);
  return {
    firstName: first,
    lastName:  last,
    phone:     String(Math.floor(20000000 + Math.random() * 79999999)), // 8-digit Danish mobile (starts 2–9)
    postcode:  postcodes[cityIdx],
    city:      cities[cityIdx],
  };
}

function fmt(date) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${date.getFullYear()}`;
}

async function setCookieConsent(context) {
  const value = JSON.stringify({
    consents_approved: [
      'cookie_cat_necessary', 'cookie_cat_functional',
      'cookie_cat_statistic', 'cookie_cat_marketing',
    ],
    consents_denied: [],
    user_uid: 'playwright-test',
    website_uuid: 'gonordiccruiseline.com',
    timestamp: new Date().toISOString(),
  });
  await context.addCookies([
    { name: 'CookieInformationConsent', value, domain: 'www.gonordiccruiseline.com', path: '/' },
    { name: 'CookieInformationConsent', value, domain: '.gonordiccruiseline.com',   path: '/' },
  ]);
}

async function dismissCookies(page) {
  await page.evaluate(() => {
    document.getElementById('coiOverlay')?.remove();
    document.getElementById('cookie-information-template-wrapper')?.remove();
  });
}

async function acceptDataPopup(page) {
  const acceptBtn = page.locator('button:has-text("Accept all")').first();
  if (await acceptBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await acceptBtn.click();
    await page.waitForTimeout(500);
  }
}

async function navigateCalendarTo(page, targetMonth, targetYear) {
  const monthNames = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
  ];
  const name = monthNames[targetMonth];
  for (let i = 0; i < 12; i++) {
    const header = await page.evaluate(() =>
      document.querySelector('[class*="CalendarHeader"]')?.textContent?.trim() || ''
    );
    if (header.includes(name) && header.includes(String(targetYear))) break;
    await page.evaluate(() =>
      document.querySelector('[aria-label*="next month" i]')?.closest('button')?.click()
    );
    await page.waitForTimeout(400);
  }
}

async function pickCombo(page, nth, searchText, { type: shouldType = true } = {}) {
  const combo = page.locator('[role="combobox"]').nth(nth);
  await combo.scrollIntoViewIfNeeded().catch(() => {});
  await combo.click({ timeout: 5000 });
  await page.waitForTimeout(400);
  if (shouldType) {
    await page.keyboard.type(searchText, { delay: 50 });
    await page.waitForTimeout(400);
  }
  const opt = page.locator('[role="listbox"] [role="option"]').filter({ hasText: searchText }).first();
  if (await opt.isVisible({ timeout: 2000 }).catch(() => false)) {
    await opt.click({ force: true });
    await page.waitForTimeout(100);
    await page.keyboard.press('Tab');
  } else {
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
  }
  await page.waitForSelector('[role="listbox"]', { state: 'detached', timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(200);
}

module.exports = {
  randomDepartureDate,
  randomPassenger,
  fmt,
  setCookieConsent,
  dismissCookies,
  acceptDataPopup,
  navigateCalendarTo,
  pickCombo,
};
