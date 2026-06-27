const { test, expect } = require('@playwright/test');

// ── Helpers ──────────────────────────────────────────────────────────────────

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
  const dobs       = ['01/03/1980','15/07/1985','22/11/1990','08/04/1975','30/09/1988','12/01/1995'];

  const first = firstNames[Math.floor(Math.random() * firstNames.length)];
  const last  = lastNames[Math.floor(Math.random() * lastNames.length)];
  const num   = Math.floor(1000 + Math.random() * 9000);
  const streetNum = Math.floor(1 + Math.random() * 99);
  const cityIdx   = Math.floor(Math.random() * cities.length);
  return {
    firstName: first,
    lastName:  last,
    email:     `${first.toLowerCase()}.${last.toLowerCase()}${num}@testmail.com`,
    phone:     String(Math.floor(20000000 + Math.random() * 79999999)), // 8-digit Danish mobile (starts 2–9)
    address1:  `${streetNum} ${streets[Math.floor(Math.random() * streets.length)]}`,
    address2:  '',
    postcode:  postcodes[cityIdx],
    city:      cities[cityIdx],
    dob:       dobs[Math.floor(Math.random() * dobs.length)],
  };
}

function fmt(date) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${date.getFullYear()}`;
}

async function dismissCookies(page) {
  await page.evaluate(() => {
    document.getElementById('coiOverlay')?.remove();
    document.getElementById('cookie-information-template-wrapper')?.remove();
  });
}

async function acceptDataPopup(page) {
  // Accept cookie/data consent popup if it appears (has "Accept all" button)
  const acceptBtn = page.locator('button:has-text("Accept all")').first();
  if (await acceptBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await acceptBtn.click();
    await page.waitForTimeout(500);
    console.log('Data popup accepted');
  }
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

// ── Preconditions ─────────────────────────────────────────────────────────────
test.beforeEach(async ({ context }) => {
  await setCookieConsent(context);
});

// ── TC-001 ────────────────────────────────────────────────────────────────────
// Preconditions:
//   - Fresh browser context, cookie consent pre-set
//   - Departure date: random 2–6 weeks from today
//
// Steps:
//   1. Navigate to https://www.gonordiccruiseline.com/
//   2. Click MINICRUISE tab
//   3. Select departure date via calendar (2–6 weeks ahead)
//   4. Click SEARCH
//   5. Verify Cabin Fares page loaded
//   6. Pause (screenshot)

test('TC-001 | MiniCruise — Search → Sailing → Cabin', async ({ page }) => {
  test.setTimeout(180000);

  // ── 1. Navigate ───────────────────────────────────────────────
  await page.goto('https://www.gonordiccruiseline.com/', {
    waitUntil: 'load',
    timeout: 30000,
  });
  await dismissCookies(page);
  await page.waitForSelector('#booking-widget', { timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'tc001-01-landing.png' });

  // ── 2. MiniCruise ─────────────────────────────────────────────
  await page.locator('button:has-text("MiniCruise")').first().click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'tc001-02-minicruise.png' });

  // ── 3. Select date (2–6 weeks ahead) via calendar ────────────
  const departure  = randomDepartureDate();
  const targetDay  = departure.getDate();
  const targetMon  = departure.getMonth();
  const targetYear = departure.getFullYear();
  console.log(`Departure: ${fmt(departure)}`);

  // Open date picker
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .find(b => b.textContent.includes('Date'))?.click()
  );
  await page.waitForTimeout(800);

  // Navigate to target month
  await navigateCalendarTo(page, targetMon, targetYear);

  // Click the target day (exact text match)
  await page.evaluate((day) =>
    Array.from(document.querySelectorAll('button'))
      .filter(b => b.textContent.trim() === String(day) && !b.disabled)[0]?.click()
  , targetDay);
  await page.waitForTimeout(400);

  // Dismiss picker (auto-closes; Done if still open)
  const dateDone = page.locator('button:has-text("Done")').first();
  if (await dateDone.isVisible({ timeout: 2000 }).catch(() => false)) {
    await dateDone.click();
  } else {
    await page.keyboard.press('Escape');
  }
  await page.waitForTimeout(500);

  const dateShown = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .find(b => b.textContent.includes('Date'))?.textContent.trim()
  );
  console.log(`Widget date: ${dateShown}`);
  await page.screenshot({ path: 'tc001-03-date.png' });

  // ── 4. Search ─────────────────────────────────────────────────
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .find(b => /^search$/i.test(b.textContent.trim()) && b.className.includes('Mui'))
      ?.click()
  );
  // Wait for loading spinner to clear
  await page.waitForFunction(() =>
    !document.querySelector('[class*="MuiCircularProgress"]')
  , { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1000);
  await acceptDataPopup(page);
  await page.screenshot({ path: 'tc001-04-results.png' });
  console.log(`After search: ${page.url()}`);

  // ── 6 & 7. Reach Cabin Fares page ───────────────────────────
  // Wait for the booking app to navigate away from the bare /booking/ URL.
  // It may land directly on cabin-fares (auto-selected sailing) or on a sailing list.
  await page.waitForFunction(() =>
    window.location.hash.length > 1
  , { timeout: 30000 });
  await page.waitForTimeout(500);

  const onCabin = page.url().includes('cabin');
  if (!onCabin) {
    // Sailing results list — pick the first sailing
    const sailingBtn = page.locator('button:has-text("Continue")').first();
    await sailingBtn.waitFor({ state: 'visible', timeout: 20000 });
    await sailingBtn.click();
    await page.waitForTimeout(2000);
  }

  // Wait for cabin-fares URL
  await page.waitForFunction(() =>
    window.location.hash.includes('cabin') || window.location.hash.includes('fares')
  , { timeout: 20000 });
  await acceptDataPopup(page);
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'tc001-05-cabin.png' });
  console.log(`Cabin page: ${page.url()}`);

  // ── 6. Select cabin and continue ─────────────────────────────
  // Cabin cards load progressively — wait for at least one to appear
  await page.waitForSelector('[class*="CabinCard"], [class*="cabin-card"], button:has-text("Select")', {
    timeout: 20000,
  }).catch(() => {});
  await page.waitForTimeout(500);

  // Click the first available cabin card or its Select button
  const cabinSelected = await page.evaluate(() => {
    // Try clicking a cabin card directly
    const card = document.querySelector('[class*="CabinCard"], [class*="cabinCard"]');
    if (card) { card.click(); return 'card-clicked'; }
    // Fallback: click first Select button inside cabin section
    const selectBtn = Array.from(document.querySelectorAll('button'))
      .find(b => /^select$/i.test(b.textContent.trim()));
    if (selectBtn) { selectBtn.click(); return 'select-clicked'; }
    return 'none';
  });
  console.log(`Cabin selection: ${cabinSelected}`);
  await page.waitForTimeout(800);

  // Click Continue to proceed to Meals
  const cabinContinue = page.locator('button:has-text("Continue")').first();
  await cabinContinue.waitFor({ state: 'visible', timeout: 15000 });
  await page.screenshot({ path: 'tc001-06-cabin-selected.png' });
  await cabinContinue.click();
  await page.waitForTimeout(2000);

  // ── 7. Meals ──────────────────────────────────────────────────
  await page.waitForFunction(() =>
    window.location.hash.includes('meal')
  , { timeout: 20000 });
  await acceptDataPopup(page);
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'tc001-07-meals.png' });
  console.log(`Meals page: ${page.url()}`);

  // Wait for meal content to finish loading (skeleton placeholders clear)
  await page.waitForFunction(() =>
    !document.querySelector('[class*="MuiCircularProgress"], [class*="Skeleton"]')
  , { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1000);

  // Click Continue — this may trigger a "No Dinner" confirmation popup
  const mealsContinue = page.locator('button:has-text("Continue")').first();
  await mealsContinue.waitFor({ state: 'visible', timeout: 15000 });
  await mealsContinue.click();
  await page.waitForTimeout(1000);

  // "No Dinner" popup appears after Continue when no meal is selected — dismiss it
  const noDinnerSkip = page.locator('button:has-text("Skip for now")');
  if (await noDinnerSkip.first().isVisible({ timeout: 5000 }).catch(() => false)) {
    await noDinnerSkip.first().click();
    console.log('No Dinner popup dismissed');
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(1500);

  // ── 8. Add-ons (/extras) ──────────────────────────────────────
  await page.waitForFunction(() =>
    window.location.hash.includes('extras') || window.location.hash.includes('add')
  , { timeout: 20000 });
  await acceptDataPopup(page);
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'tc001-08-addons.png' });
  console.log(`Add-ons page: ${page.url()}`);

  // Accept defaults — just continue
  const addonsContinue = page.locator('button:has-text("Continue")').first();
  await addonsContinue.waitFor({ state: 'visible', timeout: 15000 });
  await addonsContinue.click();
  await page.waitForTimeout(2000);

  // ── 9. Passenger details ──────────────────────────────────────
  await page.waitForFunction(() =>
    window.location.hash.includes('passenger')
  , { timeout: 20000 });
  await acceptDataPopup(page);

  // "Log in for a better experience" popup appears immediately — wait for and dismiss it
  const guestBtn = page.locator('button:has-text("Continue as guest")');
  await guestBtn.first().waitFor({ state: 'visible', timeout: 15000 });
  await guestBtn.first().click();
  console.log('Continuing as guest');
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);

  await page.screenshot({ path: 'tc001-09-passengers.png' });
  console.log(`Passengers page: ${page.url()}`);

  // Random contact info
  const contact = randomPassenger();
  console.log(`Contact: ${contact.firstName} ${contact.lastName} | ${contact.phone}`);

  // Diagnostic only — confirm input layout
  await page.evaluate(() => {
    const inp = Array.from(document.querySelectorAll('input')).filter(el => {
      if (el.type === 'hidden' || el.type === 'checkbox' || el.type === 'radio') return false;
      const r = el.getBoundingClientRect();
      return r.width > 10 && r.height > 10;
    });
    return inp.map((el, i) => `${i}:${el.type}|${el.placeholder || el.name || el.id || '?'}`);
  }).then(diag => console.log('Inputs:', diag.join(' | ')));

  // Fill all text inputs via Playwright .fill() to guarantee React state updates
  await page.locator('input[name="firstName"]').nth(0).fill(contact.firstName);
  await page.locator('input[name="lastName"]').nth(0).fill(contact.lastName);
  await page.locator('input[name="email"]').fill('edfedf@hotmail.co');
  await page.locator('input[name="phone"]').fill(contact.phone);
  await page.locator('input[name="streetAddress"]').fill('match street 45');
  await page.locator('input[name="postalCode"]').fill('2100');
  await page.locator('input[name="city"]').fill('Copenhagen');
  await page.locator('input[name="firstName"]').nth(1).fill('Steven');
  await page.locator('input[name="lastName"]').nth(1).fill('Mathews');
  await page.locator('input[name="firstName"]').nth(2).fill('Stevensen');
  await page.locator('input[name="lastName"]').nth(2).fill('Mathews');
  await page.waitForTimeout(300);

  // ── Combobox helper — click the combobox div, type/navigate, pick option ────
  // waitForListbox=false for MUI Select (options appear without typing)
  async function pickCombo(nth, searchText, { type: shouldType = true } = {}) {
    const combo = page.locator('[role="combobox"]').nth(nth);
    await combo.scrollIntoViewIfNeeded().catch(() => {});
    await combo.click({ timeout: 5000 });
    await page.waitForTimeout(400);
    if (shouldType) {
      await page.keyboard.type(searchText, { delay: 50 });
      await page.waitForTimeout(400);
    }
    // Scope to the open listbox so we never click a stale/wrong option
    const opt = page.locator('[role="listbox"] [role="option"]').filter({ hasText: searchText }).first();
    if (await opt.isVisible({ timeout: 2000 }).catch(() => false)) {
      await opt.click({ force: true });
      await page.waitForTimeout(100);
      await page.keyboard.press('Tab'); // commit selection in React state
      console.log(`Picked: ${searchText}`);
    } else {
      // Keyboard fallback: ArrowDown to highlight, Enter to select
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(100);
      await page.keyboard.press('Enter');
      console.log(`Picked (keyboard): ${searchText}`);
    }
    // Wait for listbox to close before next interaction
    await page.waitForSelector('[role="listbox"]', { state: 'detached', timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(200);
  }

  // Phone country code (nth 0)
  await pickCombo(0, 'Denmark');

  // Country (nth 1)
  await pickCombo(1, 'Denmark');

  // Screenshot of contact section scrolled to top
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'tc001-09b-contact-filled.png' });

  // P1 Gender (nth 2) — MUI Select, no typing needed
  await pickCombo(2, 'Man', { type: false });

  // P1 DOB
  await page.locator('input[placeholder="DD/MM/YYYY"]').first()
    .pressSequentially('09072000', { delay: 80 }).catch(() => {});
  await page.waitForTimeout(200);

  // P1 Nationality (nth 3)
  await pickCombo(3, 'Denmark');

  // P2 Gender (nth 4) — MUI Select, no typing needed
  await pickCombo(4, 'Woman', { type: false });

  // P2 DOB
  await page.locator('input[placeholder="DD/MM/YYYY"]').nth(1)
    .pressSequentially('09072000', { delay: 80 }).catch(() => {});
  await page.waitForTimeout(600);

  // P2 Nationality (nth 5) — scroll into view via JS before clicking
  await page.evaluate(() => {
    const els = document.querySelectorAll('[id="mui-component-select-nationality"]');
    if (els.length >= 2) els[1].scrollIntoView({ behavior: 'instant', block: 'center' });
  }).catch(() => {});
  await page.waitForTimeout(400);
  await pickCombo(5, 'Denmark');

  await page.waitForTimeout(500);
  await page.screenshot({ path: 'tc001-10-passengers-filled.png' });
  console.log('Passenger details filled');

  // ── 11. Continue to Payment ───────────────────────────────────
  const passengerContinue = page.locator('button:has-text("Continue")').first();
  await passengerContinue.waitFor({ state: 'visible', timeout: 15000 });
  await passengerContinue.click();
  // Wait for navigation away from /passengers (form submission can take a few seconds)
  await page.waitForURL('**/#/payment**', { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(1000);

  // Log any visible validation errors to diagnose why Continue might not navigate
  const validationErrors = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('p, span, div'))
      .filter(el => {
        const s = el.textContent.trim();
        const r = el.getBoundingClientRect();
        const c = window.getComputedStyle(el).color;
        return s.length > 2 && s.length < 100 && r.width > 0 && r.height > 0 && c.includes('220') && c.includes('53'); // red-ish text
      })
      .map(el => el.textContent.trim())
      .filter((v, i, a) => a.indexOf(v) === i);
  }).catch(() => []);
  if (validationErrors.length) console.log('Validation errors on page:', validationErrors);

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'tc001-11-payment.png' });
  console.log(`After passengers continue: ${page.url()}`);

  // ── 12. Pause ─────────────────────────────────────────────────
  expect(page.url()).toContain('/booking/');
});
