const { test, expect } = require('@playwright/test');
const {
  randomDepartureDate, randomPassenger, fmt,
  setCookieConsent, dismissCookies, acceptDataPopup,
  navigateCalendarTo, pickCombo,
} = require('./helpers');

// ── Preconditions ─────────────────────────────────────────────────────────────
test.beforeEach(async ({ context }) => {
  await setCookieConsent(context);
});

// ── TC-002 ────────────────────────────────────────────────────────────────────
// MiniCruise booking flow structured by booking stepper steps:
//   1. Search  2. Cabin  3. Meals  4. Add-ons  5. Passengers  6. Payment
//
// Passenger data:
//   Contact  : random name, edfedf@hotmail.co, +45 random 8-digit, match street 45, 2100 Copenhagen, Denmark
//   Passenger 1: Steven Mathews, Man, 09/07/2000, Denmark
//   Passenger 2: Stevensen Mathews, Woman, 09/07/2000, Denmark

test('TC-002 | MiniCruise — Full Booking Flow', async ({ page }) => {
  test.setTimeout(240000);

  // ── Step 1: Search ───────────────────────────────────────────────────────────
  await test.step('Step 1: Search', async () => {
    await page.goto('https://www.gonordiccruiseline.com/', { waitUntil: 'load', timeout: 30000 });
    await dismissCookies(page);
    await page.waitForSelector('#booking-widget', { timeout: 20000 });
    await page.waitForTimeout(1500);

    // Select MiniCruise tab
    await page.locator('button:has-text("MiniCruise")').first().click();
    await page.waitForTimeout(600);

    // Pick departure date (2–6 weeks ahead)
    const departure  = randomDepartureDate();
    const targetDay  = departure.getDate();
    const targetMon  = departure.getMonth();
    const targetYear = departure.getFullYear();
    console.log(`Departure: ${fmt(departure)}`);

    await page.evaluate(() =>
      Array.from(document.querySelectorAll('button'))
        .find(b => b.textContent.includes('Date'))?.click()
    );
    await page.waitForTimeout(800);
    await navigateCalendarTo(page, targetMon, targetYear);
    await page.evaluate((day) =>
      Array.from(document.querySelectorAll('button'))
        .filter(b => b.textContent.trim() === String(day) && !b.disabled)[0]?.click()
    , targetDay);
    await page.waitForTimeout(400);

    const dateDone = page.locator('button:has-text("Done")').first();
    if (await dateDone.isVisible({ timeout: 2000 }).catch(() => false)) {
      await dateDone.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(500);

    // Click Search
    await page.evaluate(() =>
      Array.from(document.querySelectorAll('button'))
        .find(b => /^search$/i.test(b.textContent.trim()) && b.className.includes('Mui'))
        ?.click()
    );
    await page.waitForFunction(() =>
      !document.querySelector('[class*="MuiCircularProgress"]')
    , { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1000);
    await acceptDataPopup(page);

    // Navigate to cabin-fares (may pass through sailing list)
    await page.waitForFunction(() => window.location.hash.length > 1, { timeout: 30000 });
    await page.waitForTimeout(500);
    if (!page.url().includes('cabin')) {
      const sailingBtn = page.locator('button:has-text("Continue")').first();
      await sailingBtn.waitFor({ state: 'visible', timeout: 20000 });
      await sailingBtn.click();
      await page.waitForTimeout(2000);
    }
    await page.waitForFunction(() =>
      window.location.hash.includes('cabin') || window.location.hash.includes('fares')
    , { timeout: 20000 });
    await acceptDataPopup(page);
    await page.screenshot({ path: 'tc002-01-search.png' });
    console.log(`Step 1 complete — URL: ${page.url()}`);
  });

  // ── Step 2: Cabin ────────────────────────────────────────────────────────────
  await test.step('Step 2: Cabin', async () => {
    await page.waitForSelector('[class*="CabinCard"], [class*="cabin-card"], button:has-text("Select")', {
      timeout: 20000,
    }).catch(() => {});
    await page.waitForTimeout(500);

    // Select first available cabin
    await page.evaluate(() => {
      const card = document.querySelector('[class*="CabinCard"], [class*="cabinCard"]');
      if (card) { card.click(); return; }
      const selectBtn = Array.from(document.querySelectorAll('button'))
        .find(b => /^select$/i.test(b.textContent.trim()));
      if (selectBtn) selectBtn.click();
    });
    await page.waitForTimeout(800);

    const cabinContinue = page.locator('button:has-text("Continue")').first();
    await cabinContinue.waitFor({ state: 'visible', timeout: 15000 });
    await page.screenshot({ path: 'tc002-02-cabin.png' });
    await cabinContinue.click();
    await page.waitForTimeout(2000);
    console.log(`Step 2 complete — URL: ${page.url()}`);
  });

  // ── Step 3: Meals ────────────────────────────────────────────────────────────
  await test.step('Step 3: Meals', async () => {
    await page.waitForFunction(() =>
      window.location.hash.includes('meal')
    , { timeout: 20000 });
    await acceptDataPopup(page);
    await page.waitForFunction(() =>
      !document.querySelector('[class*="MuiCircularProgress"], [class*="Skeleton"]')
    , { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'tc002-03-meals.png' });

    // Helper: find and check a meal checkbox by its exact label text
    async function tickMeal(labelText, tag) {
      // Mark the checkbox input in JS, then use check({ force:true }) via Playwright
      const marked = await page.evaluate((text) => {
        const textEl = Array.from(document.querySelectorAll('*'))
          .find(el => el.childElementCount === 0 && el.textContent.trim() === text);
        if (!textEl) return false;
        let el = textEl;
        for (let i = 0; i < 8; i++) {
          el = el.parentElement;
          if (!el) break;
          const cb = el.querySelector('input[type="checkbox"]:not([disabled])');
          if (cb) { cb.setAttribute('data-pw-cb', text); return true; }
        }
        return false;
      }, labelText);

      if (!marked) { console.log(`${tag}: not found`); return; }
      const cb = page.locator(`input[data-pw-cb="${labelText}"]`);
      await cb.scrollIntoViewIfNeeded().catch(() => {});
      await cb.check({ force: true, timeout: 8000 });
      console.log(`${tag}: checked`);
      await page.waitForTimeout(800);

      // Select first time slot that appeared
      const slot = page.getByText(/^\d{2}:\d{2}$/).first();
      const slotText = await slot.textContent({ timeout: 6000 }).catch(() => null);
      if (slotText) {
        await slot.click({ timeout: 6000 });
        console.log(`${tag} time: ${slotText.trim()}`);
      }
      await page.waitForTimeout(400);
    }

    // Departure trip: Dinner + Breakfast
    await tickMeal('Skagerak - Dinner buffet', 'Departure Dinner');
    await page.locator('text=Skagerak - Breakfast buffet').first().scrollIntoViewIfNeeded().catch(() => {});
    await tickMeal('Skagerak - Breakfast buffet', 'Departure Breakfast');

    // Return trip: scroll to "Select meals for the return trip" section, tick Dinner + Breakfast
    await page.locator('text=Select meals for the return trip').first().scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(500);

    // Use nth(1) for return trip checkboxes (second occurrence of each meal name)
    const returnDinnerMarked = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('*'))
        .filter(el => el.childElementCount === 0 && el.textContent.trim() === 'Skagerak - Dinner buffet');
      const returnEl = els[1]; // second occurrence = return trip
      if (!returnEl) return false;
      let el = returnEl;
      for (let i = 0; i < 8; i++) {
        el = el.parentElement;
        if (!el) break;
        const cb = el.querySelector('input[type="checkbox"]:not([disabled])');
        if (cb) { cb.setAttribute('data-pw-cb', 'return-dinner'); return true; }
      }
      return false;
    });
    if (returnDinnerMarked) {
      const rcb = page.locator('input[data-pw-cb="return-dinner"]');
      await rcb.scrollIntoViewIfNeeded().catch(() => {});
      await rcb.check({ force: true, timeout: 8000 });
      console.log('Return Dinner: checked');
      await page.waitForTimeout(800);
      const rSlot = page.getByText(/^\d{2}:\d{2}$/).first();
      const rTime = await rSlot.textContent({ timeout: 6000 }).catch(() => null);
      if (rTime) { await rSlot.click({ timeout: 6000 }); console.log(`Return Dinner time: ${rTime.trim()}`); }
      await page.waitForTimeout(400);
    }

    // Return breakfast
    const returnBreakfastEl = page.locator('text=Skagerak - Breakfast buffet').nth(1);
    if (await returnBreakfastEl.isVisible({ timeout: 3000 }).catch(() => false)) {
      await returnBreakfastEl.scrollIntoViewIfNeeded().catch(() => {});
      const returnBfMarked = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('*'))
          .filter(el => el.childElementCount === 0 && el.textContent.trim() === 'Skagerak - Breakfast buffet');
        const returnEl = els[1];
        if (!returnEl) return false;
        let el = returnEl;
        for (let i = 0; i < 8; i++) {
          el = el.parentElement;
          if (!el) break;
          const cb = el.querySelector('input[type="checkbox"]:not([disabled])');
          if (cb) { cb.setAttribute('data-pw-cb', 'return-breakfast'); return true; }
        }
        return false;
      });
      if (returnBfMarked) {
        const rbcb = page.locator('input[data-pw-cb="return-breakfast"]');
        await rbcb.check({ force: true, timeout: 8000 });
        console.log('Return Breakfast: checked');
        await page.waitForTimeout(800);
        const rbSlot = page.getByText(/^\d{2}:\d{2}$/).first();
        const rbTime = await rbSlot.textContent({ timeout: 6000 }).catch(() => null);
        if (rbTime) { await rbSlot.click({ timeout: 6000 }); console.log(`Return Breakfast time: ${rbTime.trim()}`); }
        await page.waitForTimeout(400);
      }
    }

    await page.screenshot({ path: 'tc002-03b-meal-selected.png' });

    // Continue to Add-ons
    const mealsContinue = page.locator('button:has-text("Continue")').first();
    await mealsContinue.scrollIntoViewIfNeeded().catch(() => {});
    await mealsContinue.waitFor({ state: 'visible', timeout: 15000 });
    await mealsContinue.click();

    // Wait for URL to leave meals; dismiss any "Skip" popup if navigation stalls
    await page.waitForURL(url => !url.includes('#/meals'), { timeout: 60000 }).catch(async () => {
      const skip = page.locator('button:has-text("Skip for now"), button:has-text("Skip")').first();
      if (await skip.isVisible({ timeout: 3000 }).catch(() => false)) {
        await skip.click();
        await page.waitForURL(url => !url.includes('#/meals'), { timeout: 10000 }).catch(() => {});
      }
    });
    console.log(`Step 3 complete — URL: ${page.url()}`);
  });

  // ── Step 4: Add-ons ──────────────────────────────────────────────────────────
  await test.step('Step 4: Add-ons', async () => {
    await page.waitForFunction(() =>
      window.location.hash.includes('extras') || window.location.hash.includes('add')
    , { timeout: 20000 });
    await acceptDataPopup(page);
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'tc002-04-addons.png' });

    const addonsContinue = page.locator('button:has-text("Continue")').first();
    await addonsContinue.waitFor({ state: 'visible', timeout: 15000 });
    await addonsContinue.click();
    await page.waitForTimeout(2000);
    console.log(`Step 4 complete — URL: ${page.url()}`);
  });

  // ── Step 5: Passengers ───────────────────────────────────────────────────────
  await test.step('Step 5: Passengers', async () => {
    await page.waitForFunction(() =>
      window.location.hash.includes('passenger')
    , { timeout: 20000 });
    await acceptDataPopup(page);

    // Dismiss login popup
    const guestBtn = page.locator('button:has-text("Continue as guest")');
    await guestBtn.first().waitFor({ state: 'visible', timeout: 15000 });
    await guestBtn.first().click();
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);

    const contact = randomPassenger();
    console.log(`Contact: ${contact.firstName} ${contact.lastName} | ${contact.phone}`);

    // Fill contact details
    await page.locator('input[name="firstName"]').nth(0).fill(contact.firstName);
    await page.locator('input[name="lastName"]').nth(0).fill(contact.lastName);
    await page.locator('input[name="email"]').fill('edfedf@hotmail.co');
    await page.locator('input[name="phone"]').fill(contact.phone);
    await page.locator('input[name="streetAddress"]').fill('match street 45');
    await page.locator('input[name="postalCode"]').fill('2100');
    await page.locator('input[name="city"]').fill('Copenhagen');

    // Fill passenger names
    await page.locator('input[name="firstName"]').nth(1).fill('Steven');
    await page.locator('input[name="lastName"]').nth(1).fill('Mathews');
    await page.locator('input[name="firstName"]').nth(2).fill('Stevensen');
    await page.locator('input[name="lastName"]').nth(2).fill('Mathews');
    await page.waitForTimeout(300);

    // Phone country code & Country
    await pickCombo(page, 0, 'Denmark');
    await pickCombo(page, 1, 'Denmark');

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'tc002-05a-travel-info.png' });

    // Passenger 1: Gender, DOB, Nationality
    await pickCombo(page, 2, 'Man', { type: false });
    await page.locator('input[placeholder="DD/MM/YYYY"]').first()
      .pressSequentially('09072000', { delay: 80 }).catch(() => {});
    await page.waitForTimeout(200);
    await pickCombo(page, 3, 'Denmark');

    // Passenger 2: Gender, DOB, Nationality
    await pickCombo(page, 4, 'Woman', { type: false });
    await page.locator('input[placeholder="DD/MM/YYYY"]').nth(1)
      .pressSequentially('09072000', { delay: 80 }).catch(() => {});
    await page.waitForTimeout(600);

    await page.evaluate(() => {
      const els = document.querySelectorAll('[id="mui-component-select-nationality"]');
      if (els.length >= 2) els[1].scrollIntoView({ behavior: 'instant', block: 'center' });
    }).catch(() => {});
    await page.waitForTimeout(400);
    await pickCombo(page, 5, 'Denmark');

    await page.waitForTimeout(500);
    await page.screenshot({ path: 'tc002-05b-passengers-filled.png' });

    // Continue to Payment
    const passengerContinue = page.locator('button:has-text("Continue")').first();
    await passengerContinue.waitFor({ state: 'visible', timeout: 15000 });
    await passengerContinue.click();
    await page.waitForURL('**/#/payment**', { timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(1000);
    console.log(`Step 5 complete — URL: ${page.url()}`);
  });

  // ── Step 6: Payment ──────────────────────────────────────────────────────────
  await test.step('Step 6: Payment', async () => {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'tc002-06-payment.png' });
    console.log(`Step 6 — Checkout URL: ${page.url()}`);

    expect(page.url()).toContain('/checkout');
  });
});
