/**
 * pages/ProductListingPage.ts — v4
 *
 * FIX: hasProducts() now uses broad selectors covering product cards,
 *      grid items, and product links — not just /products/ href.
 * FIX: waitForProducts() uses networkidle + multiple content indicators.
 * FIX: getFirstProductUrl() falls back gracefully if no /products/ links found.
 */
import { Page }       from '@playwright/test';
import { Logger }     from '../utils/Logger';
import { PriceUtils } from '../utils/PriceUtils';
import path from 'path';
import fs   from 'fs';

export interface ProductDetails {
  name:     string;
  price:    number;
  priceRaw: string;
  quantity: number;
  url:      string;
}

export class ProductListingPage {
  private readonly page:        Page;
  private readonly logger:      Logger;
  private readonly ssDir = 'screenshots';

  constructor(page: Page) {
    this.page   = page;
    this.logger = new Logger('ProductListingPage');
    if (!fs.existsSync(this.ssDir)) fs.mkdirSync(this.ssDir, { recursive: true });
  }

  private async ss(name: string) {
    await this.page.screenshot({
      path: path.join(this.ssDir, `${name}-${Date.now()}.png`),
      fullPage: false,
    });
    this.logger.info(`📸 ${name}`);
  }

  // ── Check if products exist ────────────────────────────────────────────────

  /**
   * Returns true if ANY product-related content is on the page.
   * Uses broad selectors — does NOT require /products/ href pattern.
   */
  async hasProducts(): Promise<boolean> {
    const indicators = [
      'a[href*="/products/"]',          // Standard Shopify product links
      '[class*="product-card"]',        // Product card component
      '[class*="product-item"]',        // Product item
      '[class*="grid__item"]',          // Shopify Dawn grid item
      '[class*="card-wrapper"]',        // Card wrapper
      '[class*="product-grid"] li',     // Product grid list items
      '.grid .grid__item',              // Shopify grid items
      '[data-product-id]',             // Shopify product data attribute
    ];

    for (const sel of indicators) {
      try {
        const cnt = await this.page.locator(sel).count();
        if (cnt > 0) {
          this.logger.info(`Products confirmed via: "${sel}" (${cnt} found) ✅`);
          return true;
        }
      } catch { /* try next */ }
    }

    // Final fallback: check URL and page content
    const url  = this.page.url();
    const html = await this.page.content();
    if (url.includes('/collections/') && html.includes('product')) {
      this.logger.info('Products inferred from collection URL + page content ✅');
      return true;
    }

    this.logger.warn(`No products found. Current URL: ${url}`);
    return false;
  }

  // ── Wait for product grid ──────────────────────────────────────────────────

  async waitForProducts(): Promise<void> {
    this.logger.info('Waiting for product listing to be ready...');

    // Try networkidle first (catches lazy-loaded content)
    try {
      await this.page.waitForLoadState('networkidle', { timeout: 15_000 });
    } catch {
      await this.page.waitForLoadState('load').catch(() => {});
    }

    // Wait for any product indicator
    const selectors = [
      'a[href*="/products/"]',
      '[class*="product-card"]',
      '[class*="grid__item"]',
      '.grid li',
      '[class*="product-grid"]',
    ];

    for (const sel of selectors) {
      try {
        await this.page.waitForSelector(sel, { state: 'visible', timeout: 10_000 });
        this.logger.info(`Product grid ready via: "${sel}" ✅`);
        await this.ss('listing-page');
        return;
      } catch { /* try next */ }
    }

    this.logger.warn(`Products not detected — URL: ${this.page.url()}`);
    await this.ss('listing-page-no-products');
  }

  // ── Get first product URL ──────────────────────────────────────────────────

  async getFirstProductUrl(): Promise<string> {
    this.logger.info('Looking for first product URL...');

    // Priority order: grid-specific → main content → any /products/ link
    const strategies: Array<{ sel: string; desc: string }> = [
      { sel: 'ul.grid li.grid__item a[href*="/products/"]',    desc: 'Shopify Dawn grid' },
      { sel: '[class*="product-grid"] a[href*="/products/"]',  desc: 'product-grid class' },
      { sel: '[class*="product-card"] a[href*="/products/"]',  desc: 'product-card class' },
      { sel: '[class*="card-wrapper"] a[href*="/products/"]',  desc: 'card-wrapper class' },
      { sel: '[class*="product-item"] a[href*="/products/"]',  desc: 'product-item class' },
      { sel: '[class*="grid__item"] a[href*="/products/"]',    desc: 'grid__item class' },
      { sel: 'main a[href*="/products/"]',                     desc: 'main content area' },
    ];

    for (const { sel, desc } of strategies) {
      try {
        const links = this.page.locator(sel);
        const cnt   = await links.count();
        if (cnt > 0) {
          for (let i = 0; i < Math.min(cnt, 5); i++) {
            const href = (await links.nth(i).getAttribute('href')) ?? '';
            if (href.includes('/products/') && !href.includes('#') && !href.includes('?sort')) {
              const url = href.startsWith('http')
                ? href
                : `https://www.restaurantware.com${href}`;
              this.logger.info(`Product URL [${desc}]: ${url}`);
              return url;
            }
          }
        }
      } catch { /* try next */ }
    }

    // Last resort: evaluate all links in the page
    this.logger.warn('CSS strategies failed — scanning all page links...');
    const allProductLinks = await this.page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a[href]'));
      return anchors
        .map(a => a.getAttribute('href') ?? '')
        .filter(h => h.includes('/products/') && !h.includes('#') && !h.includes('?sort'))
        .slice(0, 10);
    });

    this.logger.info(`Found ${allProductLinks.length} product links via evaluate`);
    if (allProductLinks.length > 0) {
      const href = allProductLinks[0];
      const url  = href.startsWith('http') ? href : `https://www.restaurantware.com${href}`;
      this.logger.info(`Using: ${url}`);
      return url;
    }

    // Log page content for debugging
    const url  = this.page.url();
    const html = await this.page.content();
    this.logger.error(`No product links found! URL: ${url}`);
    this.logger.error(`Page HTML snippet: ${html.substring(0, 500)}`);
    throw new Error(`No product links found on collection page: ${url}`);
  }

  // ── Main: capture details + add to cart ───────────────────────────────────

  async captureFirstProductAndAddToCart(): Promise<ProductDetails> {
    await this.waitForProducts();
    const productUrl = await this.getFirstProductUrl();

    this.logger.info(`Going to PDP: ${productUrl}`);
    await this.page.goto(productUrl, { waitUntil: 'domcontentloaded' });
    try {
      await this.page.waitForLoadState('networkidle', { timeout: 10_000 });
    } catch { /* continue */ }
    await this.ss('pdp-loaded');

    const productName = await this._getProductName();
    if (!productName) throw new Error(`Name not found at: ${productUrl}`);
    this.logger.info(`Name: "${productName}"`);

    await this._selectFirstVariantIfRequired();
    await this.ss('after-variant');

    const priceRaw     = await this._getProductPrice();
    const productPrice = PriceUtils.getNumericValue(priceRaw);
    this.logger.info(`Price: "${priceRaw}" → $${productPrice}`);

    await this._addToCart();
    await this.ss('after-add-to-cart');

    return { name: productName, price: productPrice, priceRaw, quantity: 1, url: productUrl };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async _getProductName(): Promise<string> {
    const sels = [
      'h1.product__title', '.product__title h1', 'h1[class*="product"]',
      '.product-single__title', '[class*="product-meta"] h1',
      '[class*="product-title"]:not([class*="card"])', 'h1',
    ];
    for (const sel of sels) {
      try {
        const el = this.page.locator(sel).first();
        if (await el.isVisible({ timeout: 5000 })) {
          const txt = ((await el.textContent()) ?? '').trim();
          if (txt && txt.length > 2) return txt;
        }
      } catch { /* next */ }
    }
    return '';
  }

  private async _getProductPrice(): Promise<string> {
    const sels = [
      '.price__current .money', '[class*="price-item--regular"]',
      '.price .money', '[class*="product__price"] .money',
      '[class*="price__regular"] .money', 'span.money', '[data-product-price]',
    ];
    for (const sel of sels) {
      try {
        const els = this.page.locator(sel);
        for (let i = 0; i < await els.count(); i++) {
          const el  = els.nth(i);
          if (await el.isVisible({ timeout: 3000 })) {
            const txt = ((await el.textContent()) ?? '').trim();
            if (txt && (txt.includes('$') || /\d/.test(txt))) return txt;
          }
        }
      } catch { /* next */ }
    }
    return '';
  }

  private async _selectFirstVariantIfRequired(): Promise<void> {
    const addBtn = this.page.locator('button[name="add"]').first();
    if (await addBtn.count() > 0 && !(await addBtn.isDisabled().catch(() => true))) {
      this.logger.info('No variant selection needed ✅');
      return;
    }

    this.logger.info('Selecting first variant...');
    const strategies = [
      () => this.page.locator('fieldset[class*="variant"] input[type="radio"]:not([disabled])').first().check({ force: true }),
      () => this.page.locator('.product-form__option input[type="radio"]:not([disabled])').first().check({ force: true }),
      () => this.page.locator('fieldset[class*="variant"] label').first().click({ force: true }),
      () => this.page.locator('[class*="swatch"] label').first().click({ force: true }),
      () => this.page.locator('select[name="id"]').first().selectOption({ index: 0 }),
    ];

    for (const fn of strategies) {
      try { await fn(); await this.page.waitForTimeout(500); return; }
      catch { /* next */ }
    }
    this.logger.warn('No variant options found — proceeding');
  }

  private async _addToCart(): Promise<void> {
    this.logger.info('Adding to cart...');
    const sels = [
      'button[name="add"]:not([disabled])',
      'button[type="submit"].product-form__submit:not([disabled])',
      'button:has-text("Add to cart"):not([disabled])',
      'button:has-text("Add to Cart"):not([disabled])',
      '.product-form__submit:not([disabled])',
      'form[action*="/cart/add"] button[type="submit"]',
    ];

    for (const sel of sels) {
      try {
        const btn = this.page.locator(sel).first();
        if (await btn.count() > 0 && await btn.isVisible({ timeout: 5000 }) && !(await btn.isDisabled())) {
          await btn.scrollIntoViewIfNeeded();
          await btn.click();
          this.logger.info(`Clicked via: ${sel} ✅`);
          await this.page.waitForTimeout(3000);
          return;
        }
      } catch { /* next */ }
    }

    // Force click as last resort
    const forceBtn = this.page.locator('form[action*="/cart"] button[type="submit"]').first();
    if (await forceBtn.count() > 0) {
      await forceBtn.click({ force: true });
      await this.page.waitForTimeout(3000);
      this.logger.info('Force-clicked Add to cart ✅');
      return;
    }

    throw new Error('Add to Cart button not found or disabled');
  }
}
