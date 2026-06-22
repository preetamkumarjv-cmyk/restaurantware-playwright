/**
 * pages/CartPage.ts
 * FIX: Added explicit waitForCartPage() with URL assertion.
 * FIX: Better Shopify cart item selectors.
 * FIX: Grand total falls back to subtotal for single-item carts.
 */
import { Page } from '@playwright/test';
import { Logger }      from '../utils/Logger';
import { PriceUtils }  from '../utils/PriceUtils';
import { CommonUtils } from '../utils/CommonUtils';

export class CartPage {
  private readonly page:   Page;
  private readonly logger: Logger;

  constructor(page: Page) {
    this.page   = page;
    this.logger = new Logger('CartPage');
  }

  async waitForCartPage(): Promise<void> {
    this.logger.info('Waiting for cart page...');
    // Navigate directly if not already on /cart
    if (!this.page.url().includes('/cart')) {
      await this.page.goto('/cart', { waitUntil: 'domcontentloaded' });
    }
    await CommonUtils.waitForFullLoad(this.page);
    await this.page.waitForSelector(
      'form[action="/cart"], [class*="cart__items"], .cart-page, ' +
      '[class*="cart-item"], tbody[class*="cart"]',
      { state: 'visible', timeout: 20_000 }
    );
    this.logger.info('Cart page loaded ✅');
  }

  async clickCheckout(): Promise<void> {
    this.logger.info('Clicking Checkout...');
    const selectors = [
      'button:has-text("Check out")',
      'button:has-text("Checkout")',
      'a:has-text("Check out")',
      'a:has-text("Checkout")',
      '[name="checkout"]',
      '.cart__checkout-button',
      'input[type="submit"][name="checkout"]',
    ];

    for (const sel of selectors) {
      try {
        const btn = this.page.locator(sel).first();
        if (await btn.isVisible({ timeout: 5000 })) {
          await btn.scrollIntoViewIfNeeded();
          await btn.click();
          await this.page.waitForLoadState('domcontentloaded');
          this.logger.info('Checkout clicked ✅');
          return;
        }
      } catch { /* try next */ }
    }
    throw new Error('Checkout button not found');
  }

  // ── Getters ───────────────────────────────────────────────────────────────

  private async _readMoney(selectors: string[]): Promise<number> {
    for (const sel of selectors) {
      try {
        // Try all matching elements (price may appear multiple times)
        const els = this.page.locator(sel);
        const cnt = await els.count();
        for (let i = 0; i < cnt; i++) {
          const el  = els.nth(i);
          if (await el.isVisible({ timeout: 3000 })) {
            const txt = ((await el.textContent()) ?? '').trim();
            const val  = PriceUtils.getNumericValue(txt);
            if (val > 0) return val;
          }
        }
      } catch { /* try next */ }
    }
    return 0;
  }

  async getProductName(): Promise<string> {
    const selectors = [
      '[class*="cart-item__name"] a',
      '[class*="cart-item__details"] a',
      '[class*="cart-item__title"]',
      'td[class*="product"] a',
      '[class*="product--cart"] a',
    ];
    for (const sel of selectors) {
      try {
        const el = this.page.locator(sel).first();
        if (await el.isVisible({ timeout: 5000 })) {
          const txt = ((await el.textContent()) ?? '').trim();
          if (txt) { this.logger.info(`Cart name: "${txt}"`); return txt; }
        }
      } catch { /* try next */ }
    }
    return '';
  }

  async getUnitPrice(): Promise<number> {
    const price = await this._readMoney([
      '[class*="cart-item__price"] .money',
      'td[class*="price"] .money',
      '[class*="product-price"] .money',
      '[class*="cart__price"] .money',
    ]);
    this.logger.info(`Cart unit price: $${price}`);
    return price;
  }

  async getQuantity(): Promise<number> {
    try {
      const input = this.page.locator(
        'input[name*="updates"], input[class*="quantity"], input[type="number"]'
      ).first();
      if (await input.isVisible({ timeout: 5000 })) {
        const val = await input.inputValue();
        const qty = parseInt(val, 10);
        this.logger.info(`Cart qty: ${qty}`);
        return isNaN(qty) ? 1 : qty;
      }
    } catch { /* try text */ }

    // Text-based quantity
    const qty = await this._readMoney([
      '[class*="cart-item__quantity-input"]',
      'td[class*="quantity"] input',
    ]);
    return qty || 1;
  }

  async getLineTotal(): Promise<number> {
    const total = await this._readMoney([
      '[class*="cart-item__totals"] .money',
      'td[class*="total"] .money',
      '[class*="cart-item"] [class*="line-total"] .money',
    ]);
    this.logger.info(`Cart line total: $${total}`);
    return total;
  }

  async getSubtotal(): Promise<number> {
    const sub = await this._readMoney([
      '[class*="totals__subtotal-value"] .money',
      '[class*="cart__subtotal"] .money',
      'p[class*="cart__subtotal"] .money',
      '.totals__subtotal .money',
    ]);
    this.logger.info(`Cart subtotal: $${sub}`);
    return sub;
  }

  async getGrandTotal(): Promise<number> {
    const total = await this._readMoney([
      '[class*="totals__total-value"] .money',
      '[class*="cart__total"] strong .money',
      '[class*="grand-total"] .money',
    ]);
    // If no distinct grand total, grand total = subtotal (pre-checkout)
    const result = total > 0 ? total : await this.getSubtotal();
    this.logger.info(`Cart grand total: $${result}`);
    return result;
  }

  async hasItems(): Promise<boolean> {
    try {
      await this.page.waitForSelector(
        '[class*="cart-item"], tr[class*="cart"], [class*="cart__product"]',
        { state: 'visible', timeout: 10_000 }
      );
      return true;
    } catch { return false; }
  }
}
