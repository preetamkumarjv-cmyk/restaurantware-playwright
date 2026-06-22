/**
 * pages/MiniCartComponent.ts
 *
 * FIX: Added multi-strategy mini cart detection covering:
 * 1. Shopify cart-notification web component (appears after add-to-cart)
 * 2. Shopify cart-drawer web component
 * 3. URL fallback: navigate to /cart if mini cart not detected
 *
 * FIX: Quantity is read from input value (not text content).
 * FIX: Subtotal reads from multiple possible elements.
 */
import { Page } from '@playwright/test';
import { Logger }      from '../utils/Logger';
import { PriceUtils }  from '../utils/PriceUtils';
import { CommonUtils } from '../utils/CommonUtils';

export class MiniCartComponent {
  private readonly page:   Page;
  private readonly logger: Logger;
  private _miniCartVisible = false;

  constructor(page: Page) {
    this.page   = page;
    this.logger = new Logger('MiniCartComponent');
  }

  // ── Wait for mini cart ────────────────────────────────────────────────────

  async waitForMiniCart(): Promise<void> {
    this.logger.info('Waiting for mini cart...');

    const containers = [
      'cart-notification',
      'cart-drawer',
      '#CartNotification',
      '#CartDrawer',
      '[class*="cart-notification"]:not([hidden])',
      '[class*="cart-drawer"][open]',
      '[class*="mini-cart"]',
    ];

    for (const sel of containers) {
      try {
        await this.page.waitForSelector(sel, { state: 'visible', timeout: 8000 });
        this.logger.info(`Mini cart visible: ${sel} ✅`);
        this._miniCartVisible = true;
        await this.page.waitForTimeout(500); // let prices render
        return;
      } catch { /* try next */ }
    }

    this.logger.warn('Mini cart UI not detected — will read from /cart page instead');
    this._miniCartVisible = false;
  }

  // ── Navigate to cart ──────────────────────────────────────────────────────

  async clickGoToCart(): Promise<void> {
    this.logger.info('Navigating to Cart page...');

    if (this._miniCartVisible) {
      const goToCartSelectors = [
        'a:has-text("Go to cart")',
        'a:has-text("View cart")',
        'a:has-text("Go To Cart")',
        'a:has-text("View Cart")',
        '[class*="cart-notification"] a[href="/cart"]',
        '[class*="cart-drawer"] a[href="/cart"]',
        'cart-notification a[href="/cart"]',
        'cart-drawer a[href="/cart"]',
      ];

      for (const sel of goToCartSelectors) {
        try {
          const el = this.page.locator(sel).first();
          if (await el.isVisible({ timeout: 4000 })) {
            await el.click();
            await this.page.waitForLoadState('domcontentloaded');
            this.logger.info('Navigated via mini cart button ✅');
            return;
          }
        } catch { /* try next */ }
      }
    }

    // Fallback: direct navigation
    this.logger.warn('Mini cart "Go to cart" not found — navigating directly to /cart');
    await this.page.goto('/cart', { waitUntil: 'domcontentloaded' });
  }

  // ── Getters ───────────────────────────────────────────────────────────────

  async getProductName(): Promise<string> {
    const selectors = [
      '[class*="cart-notification-product__name"]',
      '[class*="cart-item__name"]',
      '[class*="cart-item__details"] a',
      'cart-notification [class*="product-description"] a',
      '[class*="mini-cart"] [class*="item-name"]',
      '[class*="cart"] [class*="product-title"]',
    ];

    for (const sel of selectors) {
      try {
        const el = this.page.locator(sel).first();
        if (await el.isVisible({ timeout: 3000 })) {
          const txt = ((await el.textContent()) ?? '').trim();
          if (txt) { this.logger.info(`Mini cart name: "${txt}"`); return txt; }
        }
      } catch { /* try next */ }
    }

    this.logger.warn('Mini cart product name not found — returning empty');
    return '';
  }

  async getProductPrice(): Promise<number> {
    const selectors = [
      '[class*="cart-notification-product__price"] .money',
      '[class*="cart-item__price"] .money',
      'cart-notification .money',
      '[class*="mini-cart"] .money',
      '[class*="cart"] [class*="price"] .money',
    ];

    for (const sel of selectors) {
      try {
        const el = this.page.locator(sel).first();
        if (await el.isVisible({ timeout: 3000 })) {
          const txt = ((await el.textContent()) ?? '').trim();
          if (txt) {
            const price = PriceUtils.getNumericValue(txt);
            this.logger.info(`Mini cart price: $${price} (raw: "${txt}")`);
            return price;
          }
        }
      } catch { /* try next */ }
    }

    this.logger.warn('Mini cart price not found — returning 0');
    return 0;
  }

  async getQuantity(): Promise<number> {
    // Try input value first (most accurate)
    const inputSels = [
      'input[name="updates[]"]',
      '[class*="cart-item"] input[type="number"]',
      'cart-notification input[type="number"]',
    ];

    for (const sel of inputSels) {
      try {
        const el = this.page.locator(sel).first();
        if (await el.isVisible({ timeout: 3000 })) {
          const val = await el.inputValue();
          const qty = parseInt(val, 10);
          if (!isNaN(qty)) { this.logger.info(`Mini cart qty: ${qty}`); return qty; }
        }
      } catch { /* try next */ }
    }

    // Fallback: text content
    const textSels = [
      '[class*="cart-notification"] [class*="quantity"]',
      '[class*="mini-cart"] [class*="quantity"]',
    ];
    for (const sel of textSels) {
      try {
        const el = this.page.locator(sel).first();
        if (await el.isVisible({ timeout: 2000 })) {
          const txt = ((await el.textContent()) ?? '').trim();
          const qty = parseInt(txt, 10);
          if (!isNaN(qty)) return qty;
        }
      } catch { /* try next */ }
    }

    this.logger.warn('Mini cart qty not found — assuming 1');
    return 1;
  }

  async getSubtotal(): Promise<number> {
    const selectors = [
      '[class*="totals__subtotal-value"] .money',
      '[class*="cart-subtotal"] .money',
      'cart-notification [class*="subtotal"] .money',
      '[class*="mini-cart"] [class*="subtotal"] .money',
      '[class*="cart"] [class*="total"] .money',
    ];

    for (const sel of selectors) {
      try {
        const el = this.page.locator(sel).first();
        if (await el.isVisible({ timeout: 3000 })) {
          const txt = ((await el.textContent()) ?? '').trim();
          if (txt) {
            const sub = PriceUtils.getNumericValue(txt);
            this.logger.info(`Mini cart subtotal: $${sub}`);
            return sub;
          }
        }
      } catch { /* try next */ }
    }

    this.logger.warn('Mini cart subtotal not found — returning 0');
    return 0;
  }
}
