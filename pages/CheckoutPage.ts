/**
 * pages/CheckoutPage.ts
 * FIX: Handles Shopify checkout which may be on a different subdomain.
 * FIX: Coupon field detection with multiple strategies.
 * FIX: Waits for discount to be computed before reading values.
 * FIX: Discount amount reads as absolute value (Shopify shows "-$X.XX").
 */
import { Page } from '@playwright/test';
import { Logger }      from '../utils/Logger';
import { PriceUtils }  from '../utils/PriceUtils';
import { CommonUtils } from '../utils/CommonUtils';

export class CheckoutPage {
  private readonly page: Page;
  private readonly logger: Logger;

  constructor(page: Page) {
    this.page   = page;
    this.logger = new Logger('CheckoutPage');
  }

  async waitForCheckoutPage(): Promise<void> {
    this.logger.info('Waiting for checkout page...');
    // Shopify checkout URL can be: /checkouts/... or on checkout subdomain
    await this.page.waitForURL(/checkout|checkouts/, { timeout: 30_000 });
    await CommonUtils.waitForFullLoad(this.page);
    await this.page.waitForTimeout(2000); // let Shopify JS initialize
    this.logger.info('Checkout page ready ✅');
  }

  async applyCoupon(code: string): Promise<void> {
    this.logger.info(`Applying coupon: "${code}"`);

    // ── Step 1: Find and expand discount section ─────────────────────────────
    const toggleSelectors = [
      'button:has-text("Discount code")',
      'a:has-text("Discount code")',
      '[class*="reduction-code"] button',
      '[aria-label*="discount" i]',
      'summary:has-text("Discount")',
    ];

    for (const sel of toggleSelectors) {
      try {
        const el = this.page.locator(sel).first();
        if (await el.isVisible({ timeout: 3000 })) {
          await el.click();
          await this.page.waitForTimeout(500);
          this.logger.info(`Expanded discount section via: ${sel}`);
          break;
        }
      } catch { /* already expanded */ }
    }

    // ── Step 2: Find discount input ──────────────────────────────────────────
    const inputSelectors = [
      '#checkout_reduction_code',
      'input[name="discount"]',
      'input[placeholder*="Discount" i]',
      'input[placeholder*="Gift card" i]',
      'input[id*="discount" i]',
      '[class*="reduction-code"] input',
    ];

    let input = null;
    for (const sel of inputSelectors) {
      try {
        const el = this.page.locator(sel).first();
        if (await el.isVisible({ timeout: 5000 })) {
          input = el;
          this.logger.info(`Discount input found: ${sel}`);
          break;
        }
      } catch { /* try next */ }
    }

    if (!input) throw new Error('Discount input field not found on checkout page');

    // ── Step 3: Type the code ────────────────────────────────────────────────
    await input.click();
    await input.clear();
    await input.fill(code);
    this.logger.info(`Typed coupon code: "${code}"`);
    await this.page.waitForTimeout(300);

    // ── Step 4: Click Apply ──────────────────────────────────────────────────
    const applySelectors = [
      'button:has-text("Apply")',
      '[class*="reduction-code"] button[type="submit"]',
      'button[aria-label*="Apply" i]',
      'input[type="submit"]:near(input[id*="discount" i])',
    ];

    for (const sel of applySelectors) {
      try {
        const btn = this.page.locator(sel).first();
        if (await btn.isVisible({ timeout: 3000 })) {
          await btn.click();
          this.logger.info('Apply button clicked ✅');
          break;
        }
      } catch { /* try next */ }
    }

    // ── Step 5: Wait for discount to be applied ──────────────────────────────
    this.logger.info('Waiting for discount to be computed...');
    await this.page.waitForTimeout(3000);

    // Wait for either success (discount line) or error message
    const discountLineSelectors = [
      '[class*="reduction-code"][class*="applied"]',
      '[class*="discount"] [class*="value"]',
      '.total-line--discount',
      '[data-reduction-label]',
      '[class*="savings"]',
    ];

    for (const sel of discountLineSelectors) {
      try {
        await this.page.waitForSelector(sel, { state: 'visible', timeout: 8000 });
        this.logger.info(`Discount applied — confirmed via: ${sel} ✅`);
        return;
      } catch { /* try next */ }
    }

    this.logger.warn('Discount confirmation element not found — proceeding with value reads');
  }

  // ── Getters ───────────────────────────────────────────────────────────────

  async isDiscountApplied(): Promise<boolean> {
    const selectors = [
      '.total-line--discount',
      '[class*="reduction-code"]',
      '[class*="discount-code"]',
      '[data-reduction-label]',
      '[class*="savings"]',
    ];
    for (const sel of selectors) {
      try {
        if (await this.page.locator(sel).first().isVisible({ timeout: 5000 })) return true;
      } catch { /* try next */ }
    }
    return false;
  }

  async getDiscountAmount(): Promise<number> {
    const selectors = [
      '.total-line--discount .total-line__price .order-summary__emphasis',
      '[class*="reduction"] [class*="price"]',
      '[class*="discount"] [class*="price"]',
      '.total-line--discount .payment-due__price',
      '[class*="discount-amount"]',
      '[class*="savings"] .money',
    ];

    for (const sel of selectors) {
      try {
        const el = this.page.locator(sel).first();
        if (await el.isVisible({ timeout: 5000 })) {
          const txt = ((await el.textContent()) ?? '').replace('-', '').trim();
          const val = PriceUtils.getNumericValue(txt);
          if (val > 0) { this.logger.info(`Discount: $${val}`); return val; }
        }
      } catch { /* try next */ }
    }

    this.logger.warn('Discount amount not found — returning 0');
    return 0;
  }

  async getTotalSavings(): Promise<number> {
    return this.getDiscountAmount();
  }

  async getSubtotal(): Promise<number> {
    const selectors = [
      '.total-line--subtotal .total-line__price .order-summary__emphasis',
      '.total-line--subtotal .order-summary__emphasis',
      '[class*="subtotal"] .order-summary__emphasis',
      '[class*="subtotal"] .payment-due__price',
    ];

    for (const sel of selectors) {
      try {
        const el = this.page.locator(sel).first();
        if (await el.isVisible({ timeout: 5000 })) {
          const txt = ((await el.textContent()) ?? '').trim();
          const val = PriceUtils.getNumericValue(txt);
          if (val > 0) { this.logger.info(`Checkout subtotal: $${val}`); return val; }
        }
      } catch { /* try next */ }
    }

    return 0;
  }

  async getFinalTotal(): Promise<number> {
    const selectors = [
      '.payment-due__price',
      '[class*="total-line--total"] .payment-due__price',
      'strong.payment-due__price',
      '[class*="total-due"] .money',
    ];

    for (const sel of selectors) {
      try {
        const el = this.page.locator(sel).first();
        if (await el.isVisible({ timeout: 5000 })) {
          const txt = ((await el.textContent()) ?? '').trim();
          const val = PriceUtils.getNumericValue(txt);
          if (val > 0) { this.logger.info(`Final total: $${val}`); return val; }
        }
      } catch { /* try next */ }
    }

    return 0;
  }
}
