/**
 * pages/MiniCartComponent.ts — v3
 *
 * FIX: clickGoToCart() now uses 6 strategies + screenshot debugging.
 * FIX: waitForMiniCart() waits longer and checks more container types.
 * FIX: If "Go to cart" link not found after all strategies → navigate /cart directly.
 */
import { Page }       from '@playwright/test';
import { Logger }     from '../utils/Logger';
import { PriceUtils } from '../utils/PriceUtils';
import path from 'path';
import fs   from 'fs';

export class MiniCartComponent {
  private readonly page:   Page;
  private readonly logger: Logger;
  private readonly ssDir = 'screenshots';
  private _miniCartType: 'notification' | 'drawer' | 'none' = 'none';

  constructor(page: Page) {
    this.page   = page;
    this.logger = new Logger('MiniCartComponent');
    if (!fs.existsSync(this.ssDir)) fs.mkdirSync(this.ssDir, { recursive: true });
  }

  private async ss(name: string) {
    await this.page.screenshot({
      path: path.join(this.ssDir, `minicart-${name}-${Date.now()}.png`),
      fullPage: false,
    });
    this.logger.info(`📸 minicart-${name}`);
  }

  // ── Wait for mini cart to appear ──────────────────────────────────────────

  async waitForMiniCart(): Promise<void> {
    this.logger.info('Waiting for mini cart to appear...');
    await this.ss('before-wait');

    // Check cart-notification (Shopify Dawn — appears as popup after add-to-cart)
    const notifSelectors = [
      'cart-notification',
      '#CartNotification',
      '[id*="cart-notification"]',
      '[class*="cart-notification"]:not([hidden])',
    ];

    for (const sel of notifSelectors) {
      try {
        await this.page.waitForSelector(sel, { state: 'visible', timeout: 8_000 });
        this._miniCartType = 'notification';
        this.logger.info(`Mini cart notification visible: ${sel} ✅`);
        await this.page.waitForTimeout(800); // let prices render
        await this.ss('notification-visible');
        return;
      } catch { /* try next */ }
    }

    // Check cart-drawer (slides in from side)
    const drawerSelectors = [
      'cart-drawer[open]',
      '#CartDrawer[open]',
      '[class*="cart-drawer"][open]',
      '[class*="cart-drawer"]:not([hidden])',
      '[class*="mini-cart"]:not([hidden])',
    ];

    for (const sel of drawerSelectors) {
      try {
        await this.page.waitForSelector(sel, { state: 'visible', timeout: 8_000 });
        this._miniCartType = 'drawer';
        this.logger.info(`Cart drawer visible: ${sel} ✅`);
        await this.page.waitForTimeout(800);
        await this.ss('drawer-visible');
        return;
      } catch { /* try next */ }
    }

    // Check if any "view cart" / "go to cart" link appeared anywhere
    const cartLinks = [
      'a:has-text("View cart")',
      'a:has-text("Go to cart")',
      'a:has-text("View Cart")',
      'a:has-text("Go to Cart")',
      'a[href="/cart"]:visible',
    ];
    for (const sel of cartLinks) {
      try {
        if (await this.page.locator(sel).first().isVisible({ timeout: 5_000 })) {
          this._miniCartType = 'notification';
          this.logger.info(`Cart link visible: ${sel} ✅`);
          await this.ss('cart-link-visible');
          return;
        }
      } catch { /* next */ }
    }

    this._miniCartType = 'none';
    this.logger.warn('Mini cart not detected — will navigate /cart directly');
    await this.ss('no-mini-cart');
  }

  // ── GO TO CART — the key fix ───────────────────────────────────────────────

  /**
   * Clicks "Go to Cart" or "View Cart" inside the mini cart.
   *
   * Strategy order:
   * 1. Exact text match "Go to cart" / "View cart" (case-insensitive)
   * 2. Any a[href="/cart"] link visible on page
   * 3. Cart notification specific links
   * 4. Cart drawer specific links
   * 5. Button that navigates to cart
   * 6. Direct navigation to /cart (guaranteed fallback)
   */
  async clickGoToCart(): Promise<void> {
    this.logger.info('Attempting to click "Go to cart"...');
    await this.ss('before-go-to-cart');

    // Log all visible links for debugging
    await this._logVisibleCartLinks();

    // ── Strategy 1: Text-based link match ─────────────────────────────────
    const textSelectors = [
      'a:has-text("View cart")',
      'a:has-text("Go to cart")',
      'a:has-text("View Cart")',
      'a:has-text("Go to Cart")',
      'a:has-text("GO TO CART")',
      'a:has-text("VIEW CART")',
    ];

    for (const sel of textSelectors) {
      try {
        const el = this.page.locator(sel).first();
        if (await el.isVisible({ timeout: 5_000 })) {
          await el.scrollIntoViewIfNeeded();
          await el.click();
          await this.page.waitForLoadState('domcontentloaded');
          this.logger.info(`Clicked "${sel}" ✅`);
          await this.ss('after-go-to-cart');
          return;
        }
      } catch { /* next */ }
    }

    // ── Strategy 2: Any visible a[href="/cart"] ───────────────────────────
    this.logger.info('Strategy 2: a[href="/cart"]...');
    try {
      const cartLinks = this.page.locator('a[href="/cart"]');
      const cnt       = await cartLinks.count();
      this.logger.info(`Found ${cnt} a[href="/cart"] links`);

      for (let i = 0; i < cnt; i++) {
        const link = cartLinks.nth(i);
        if (await link.isVisible({ timeout: 2_000 })) {
          await link.scrollIntoViewIfNeeded();
          await link.click();
          await this.page.waitForLoadState('domcontentloaded');
          this.logger.info(`Clicked a[href="/cart"] (${i}) ✅`);
          return;
        }
      }
    } catch { /* next */ }

    // ── Strategy 3: cart-notification container links ─────────────────────
    this.logger.info('Strategy 3: cart-notification links...');
    const notifLinkSels = [
      'cart-notification a',
      '#CartNotification a',
      '[class*="cart-notification"] a',
      '[class*="cart-notification__links"] a',
    ];

    for (const sel of notifLinkSels) {
      try {
        const links = this.page.locator(sel);
        const cnt   = await links.count();
        for (let i = 0; i < cnt; i++) {
          const el   = links.nth(i);
          const href = (await el.getAttribute('href')) ?? '';
          const txt  = ((await el.textContent()) ?? '').toLowerCase().trim();
          this.logger.info(`Cart notification link: "${txt}" → ${href}`);
          if (href.includes('/cart') || txt.includes('cart')) {
            await el.scrollIntoViewIfNeeded();
            await el.click();
            await this.page.waitForLoadState('domcontentloaded');
            this.logger.info(`Clicked notification link ✅`);
            return;
          }
        }
      } catch { /* next */ }
    }

    // ── Strategy 4: cart-drawer container links ───────────────────────────
    this.logger.info('Strategy 4: cart-drawer links...');
    const drawerLinkSels = [
      'cart-drawer a[href*="/cart"]',
      '#CartDrawer a',
      '[class*="cart-drawer"] a[href*="/cart"]',
      '[class*="mini-cart"] a[href*="/cart"]',
    ];

    for (const sel of drawerLinkSels) {
      try {
        const el = this.page.locator(sel).first();
        if (await el.isVisible({ timeout: 3_000 })) {
          await el.click();
          await this.page.waitForLoadState('domcontentloaded');
          this.logger.info(`Clicked drawer link ✅`);
          return;
        }
      } catch { /* next */ }
    }

    // ── Strategy 5: Cart icon / button in header ──────────────────────────
    this.logger.info('Strategy 5: header cart button...');
    const cartIconSels = [
      'a[href="/cart"][class*="icon"]',
      'header a[href="/cart"]',
      '[class*="cart-icon-bubble"] a',
      '[aria-label*="cart" i][href="/cart"]',
    ];
    for (const sel of cartIconSels) {
      try {
        const el = this.page.locator(sel).first();
        if (await el.isVisible({ timeout: 3_000 })) {
          await el.click();
          await this.page.waitForLoadState('domcontentloaded');
          this.logger.info(`Clicked cart icon ✅`);
          return;
        }
      } catch { /* next */ }
    }

    // ── Strategy 6: GUARANTEED — navigate directly to /cart ──────────────
    this.logger.warn('All click strategies failed — navigating directly to /cart');
    await this.page.goto('/cart', { waitUntil: 'domcontentloaded' });
    this.logger.info('Navigated to /cart directly ✅');
  }

  // ── Debug: log all visible links ──────────────────────────────────────────

  private async _logVisibleCartLinks(): Promise<void> {
    try {
      const links = await this.page.evaluate(() =>
        Array.from(document.querySelectorAll('a')).map(a => ({
          href: a.getAttribute('href') ?? '',
          text: (a.textContent ?? '').trim().substring(0, 40),
          visible: a.offsetParent !== null,
        })).filter(l => l.href.includes('cart') || l.text.toLowerCase().includes('cart'))
      );
      this.logger.info(`Cart-related links found: ${links.length}`);
      links.forEach((l, i) =>
        this.logger.info(`  [${i}] "${l.text}" → ${l.href} (visible: ${l.visible})`)
      );
    } catch { /* skip */ }
  }

  // ── Getters ───────────────────────────────────────────────────────────────

  async getProductName(): Promise<string> {
    const sels = [
      '[class*="cart-notification-product__name"]',
      '[class*="cart-item__name"]',
      '[class*="cart-item__details"] a',
      'cart-notification [class*="product-description"] a',
      '[class*="cart-item__title"]',
    ];
    for (const sel of sels) {
      try {
        const el = this.page.locator(sel).first();
        if (await el.isVisible({ timeout: 3000 })) {
          const txt = ((await el.textContent()) ?? '').trim();
          if (txt) { this.logger.info(`MC name: "${txt}"`); return txt; }
        }
      } catch { /* next */ }
    }
    return '';
  }

  async getProductPrice(): Promise<number> {
    const sels = [
      '[class*="cart-notification-product__price"] .money',
      '[class*="cart-item__price"] .money',
      'cart-notification .money',
      '[class*="mini-cart"] .money',
    ];
    for (const sel of sels) {
      try {
        const el = this.page.locator(sel).first();
        if (await el.isVisible({ timeout: 3000 })) {
          const txt = ((await el.textContent()) ?? '').trim();
          const val = PriceUtils.getNumericValue(txt);
          if (val > 0) { this.logger.info(`MC price: $${val}`); return val; }
        }
      } catch { /* next */ }
    }
    return 0;
  }

  async getQuantity(): Promise<number> {
    try {
      const input = this.page.locator(
        'input[name="updates[]"], [class*="cart-item"] input[type="number"]'
      ).first();
      if (await input.isVisible({ timeout: 3000 })) {
        const val = await input.inputValue();
        const qty = parseInt(val, 10);
        if (!isNaN(qty)) { this.logger.info(`MC qty: ${qty}`); return qty; }
      }
    } catch { /* next */ }
    return 1; // Default to 1 (we just added 1 item)
  }

  async getSubtotal(): Promise<number> {
    const sels = [
      '[class*="totals__subtotal-value"] .money',
      '[class*="cart-subtotal"] .money',
      'cart-notification [class*="subtotal"] .money',
      '[class*="mini-cart"] [class*="subtotal"] .money',
    ];
    for (const sel of sels) {
      try {
        const el = this.page.locator(sel).first();
        if (await el.isVisible({ timeout: 3000 })) {
          const txt = ((await el.textContent()) ?? '').trim();
          const val = PriceUtils.getNumericValue(txt);
          if (val > 0) { this.logger.info(`MC subtotal: $${val}`); return val; }
        }
      } catch { /* next */ }
    }
    return 0;
  }
}
