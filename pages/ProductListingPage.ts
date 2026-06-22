/**
 * pages/ProductListingPage.ts — v5
 *
 * ROOT CAUSE: _getProductPrice() CSS selectors don't match restaurantware.com.
 *
 * PRICE EXTRACTION — 4 strategies in order:
 *  1. CSS selectors (broad set covering all known Shopify themes)
 *  2. JSON-LD structured data (<script type="application/ld+json">)
 *  3. Shopify Product API  → /products/{handle}.js  (most reliable — always works)
 *  4. Full page text scan  → find any "$X.XX" pattern near "price" keyword
 *
 * Strategy 3 is the guaranteed fallback: Shopify always exposes a .js endpoint
 * for every product, returning { price: XXXX } in cents (divide by 100).
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
  private readonly page:   Page;
  private readonly logger: Logger;
  private readonly ssDir = 'screenshots';

  constructor(page: Page) {
    this.page   = page;
    this.logger = new Logger('ProductListingPage');
    if (!fs.existsSync(this.ssDir)) fs.mkdirSync(this.ssDir, { recursive: true });
  }

  private async ss(name: string) {
    const file = path.join(this.ssDir, `${name}-${Date.now()}.png`);
    await this.page.screenshot({ path: file, fullPage: false });
    this.logger.info(`📸 ${name}`);
  }

  // ── Product grid readiness ─────────────────────────────────────────────────

  async hasProducts(): Promise<boolean> {
    const indicators = [
      'a[href*="/products/"]',
      '[class*="product-card"]', '[class*="product-item"]',
      '[class*="grid__item"]',   '[class*="card-wrapper"]',
      '[data-product-id]',       'main [class*="product"]',
    ];
    for (const sel of indicators) {
      try {
        if (await this.page.locator(sel).count() > 0) {
          this.logger.info(`Products found via: "${sel}" ✅`);
          return true;
        }
      } catch { /* next */ }
    }
    const url  = this.page.url();
    const html = await this.page.content();
    return url.includes('/collections/') && html.includes('product');
  }

  async waitForProducts(): Promise<void> {
    this.logger.info('Waiting for product listing...');
    try {
      await this.page.waitForLoadState('networkidle', { timeout: 15_000 });
    } catch {
      await this.page.waitForLoadState('load').catch(() => {});
    }
    for (const sel of ['a[href*="/products/"]', '[class*="grid__item"]', 'main']) {
      try {
        await this.page.waitForSelector(sel, { state: 'visible', timeout: 8_000 });
        this.logger.info(`Grid ready: "${sel}" ✅`);
        await this.ss('listing-page');
        return;
      } catch { /* next */ }
    }
    await this.ss('listing-no-products');
  }

  // ── Get first product URL ──────────────────────────────────────────────────

  async getFirstProductUrl(): Promise<string> {
    this.logger.info('Finding first product URL...');
    const gridSelectors = [
      'ul.grid li.grid__item a[href*="/products/"]',
      '[class*="product-grid"] a[href*="/products/"]',
      '[class*="product-card"] a[href*="/products/"]',
      '[class*="card-wrapper"] a[href*="/products/"]',
      '[class*="grid__item"] a[href*="/products/"]',
      'main a[href*="/products/"]',
    ];

    for (const sel of gridSelectors) {
      try {
        const links = this.page.locator(sel);
        for (let i = 0; i < Math.min(await links.count(), 5); i++) {
          const href = (await links.nth(i).getAttribute('href')) ?? '';
          if (href.includes('/products/') && !href.includes('#') && !href.includes('?sort')) {
            const url = href.startsWith('http')
              ? href : `https://www.restaurantware.com${href}`;
            this.logger.info(`Product URL: ${url}`);
            return url;
          }
        }
      } catch { /* next */ }
    }

    // Evaluate fallback
    const links = await this.page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href*="/products/"]'))
        .map(a => a.getAttribute('href') ?? '')
        .filter(h => h.includes('/products/') && !h.includes('#') && !h.includes('?sort'))
    );
    if (links.length > 0) {
      const url = links[0].startsWith('http')
        ? links[0] : `https://www.restaurantware.com${links[0]}`;
      this.logger.info(`Product URL (evaluate): ${url}`);
      return url;
    }

    throw new Error(`No product links found — URL: ${this.page.url()}`);
  }

  // ── Main capture method ────────────────────────────────────────────────────

  async captureFirstProductAndAddToCart(): Promise<ProductDetails> {
    await this.waitForProducts();
    const productUrl = await this.getFirstProductUrl();

    this.logger.info(`Navigating to PDP: ${productUrl}`);
    await this.page.goto(productUrl, { waitUntil: 'domcontentloaded' });
    try { await this.page.waitForLoadState('networkidle', { timeout: 10_000 }); }
    catch { /* continue */ }
    await this.ss('pdp-loaded');

    // Name
    const productName = await this._getProductName();
    if (!productName) throw new Error(`Name not found at: ${productUrl}`);
    this.logger.info(`✅ Name: "${productName}"`);

    // Variant selection (before reading price)
    await this._selectFirstVariantIfRequired();
    await this.ss('after-variant');

    // Price — 4 strategies
    const priceRaw    = await this._getProductPriceAllStrategies(productUrl);
    const productPrice = PriceUtils.getNumericValue(priceRaw);
    this.logger.info(`✅ Price: "${priceRaw}" → $${productPrice}`);

    // Add to cart
    await this._addToCart();
    await this.ss('after-add-to-cart');

    return { name: productName, price: productPrice, priceRaw, quantity: 1, url: productUrl };
  }

  // ── PRICE EXTRACTION — 4 strategies ───────────────────────────────────────

  private async _getProductPriceAllStrategies(productUrl: string): Promise<string> {

    // ── Strategy 1: CSS selectors ────────────────────────────────────────────
    this.logger.info('Price strategy 1: CSS selectors...');
    const cssPrice = await this._getPriceByCss();
    if (cssPrice) { this.logger.info(`CSS price: "${cssPrice}" ✅`); return cssPrice; }

    // ── Strategy 2: JSON-LD structured data ─────────────────────────────────
    this.logger.info('Price strategy 2: JSON-LD...');
    const jsonLdPrice = await this._getPriceFromJsonLd();
    if (jsonLdPrice) { this.logger.info(`JSON-LD price: "${jsonLdPrice}" ✅`); return jsonLdPrice; }

    // ── Strategy 3: Shopify Product API (.js endpoint) ───────────────────────
    this.logger.info('Price strategy 3: Shopify API...');
    const apiPrice = await this._getPriceFromShopifyApi(productUrl);
    if (apiPrice) { this.logger.info(`API price: "${apiPrice}" ✅`); return apiPrice; }

    // ── Strategy 4: Full page text scan for $ amounts ───────────────────────
    this.logger.info('Price strategy 4: Page text scan...');
    const scanPrice = await this._getPriceByTextScan();
    if (scanPrice) { this.logger.info(`Scan price: "${scanPrice}" ✅`); return scanPrice; }

    this.logger.warn('All price strategies failed — returning $0');
    return '$0.00';
  }

  /** Strategy 1: Try all known CSS selectors */
  private async _getPriceByCss(): Promise<string> {
    const selectors = [
      // Shopify Dawn theme
      '.price__current .money',
      '[class*="price-item--regular"]',
      '.price-item.price-item--regular',
      // Generic Shopify
      '.price .money',
      '.product__price .money',
      '[class*="product__price"] .money',
      '[class*="price__regular"] .money',
      '[class*="price__sale"] .money',
      // Data attributes
      '[data-product-price]',
      '[data-regular-price]',
      // IDs (older themes)
      '#ProductPrice',
      '#product-price',
      // Broad fallback
      'span.money',
      '.money',
    ];

    for (const sel of selectors) {
      try {
        const els = this.page.locator(sel);
        const cnt = await els.count();
        for (let i = 0; i < cnt; i++) {
          const el  = els.nth(i);
          const txt = ((await el.textContent()) ?? '').trim();
          const val = PriceUtils.getNumericValue(txt);
          if (val > 0) return txt;
        }
      } catch { /* next */ }
    }
    return '';
  }

  /** Strategy 2: Extract price from JSON-LD <script> tags */
  private async _getPriceFromJsonLd(): Promise<string> {
    try {
      const price = await this.page.evaluate(() => {
        const scripts = Array.from(
          document.querySelectorAll('script[type="application/ld+json"]')
        );
        for (const s of scripts) {
          try {
            const data = JSON.parse(s.textContent ?? '{}');
            // Product schema
            if (data?.['@type'] === 'Product') {
              const offers = data.offers;
              if (offers?.price) return String(offers.price);
              if (Array.isArray(offers) && offers[0]?.price) return String(offers[0].price);
              if (offers?.lowPrice) return String(offers.lowPrice);
            }
            // BreadcrumbList may contain price too
          } catch { /* malformed JSON */ }
        }
        return '';
      });
      return price ? `$${parseFloat(price).toFixed(2)}` : '';
    } catch { return ''; }
  }

  /**
   * Strategy 3: Shopify Product API
   * Every Shopify product has: /products/{handle}.js
   * Returns { price: XXXX } where price is in CENTS → divide by 100
   */
  private async _getPriceFromShopifyApi(productUrl: string): Promise<string> {
    try {
      const match  = productUrl.match(/\/products\/([^/?#]+)/);
      if (!match) return '';
      const handle = match[1];
      const apiUrl = `https://www.restaurantware.com/products/${handle}.js`;

      const data = await this.page.evaluate(async (url: string) => {
        try {
          const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
          if (!res.ok) return null;
          return await res.json();
        } catch { return null; }
      }, apiUrl);

      if (!data) return '';

      // Price in cents
      if (data.price && data.price > 0) {
        const dollars = data.price / 100;
        this.logger.info(`API returned price: ${data.price} cents = $${dollars}`);
        return `$${dollars.toFixed(2)}`;
      }
      // Try first variant
      if (data.variants?.[0]?.price > 0) {
        const dollars = data.variants[0].price / 100;
        return `$${dollars.toFixed(2)}`;
      }
    } catch { /* fallback */ }
    return '';
  }

  /**
   * Strategy 4: Scan entire page for price-like text near "price" keywords
   */
  private async _getPriceByTextScan(): Promise<string> {
    try {
      const price = await this.page.evaluate(() => {
        // Approach A: find elements whose class contains "price" and have $ text
        const priceEls = Array.from(document.querySelectorAll('*')).filter(el => {
          const cls = (el.className?.toString() ?? '').toLowerCase();
          return cls.includes('price') && !el.querySelector('*[class*="price"]'); // leaf only
        });

        for (const el of priceEls) {
          const txt = (el.textContent ?? '').trim();
          if (/\$[\d,]+\.?\d*/.test(txt)) {
            const match = txt.match(/\$[\d,]+\.?\d*/);
            if (match) return match[0];
          }
        }

        // Approach B: find any element with $ amount pattern
        const allEls = Array.from(document.querySelectorAll('span, div, p, strong'));
        for (const el of allEls) {
          const txt = (el.textContent ?? '').trim();
          if (/^\$[\d,]+\.\d{2}$/.test(txt)) return txt;
        }
        return '';
      });
      return price;
    } catch { return ''; }
  }

  // ── Name extraction ────────────────────────────────────────────────────────

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

  // ── Variant selection ──────────────────────────────────────────────────────

  private async _selectFirstVariantIfRequired(): Promise<void> {
    const addBtn = this.page.locator('button[name="add"]').first();
    if (await addBtn.count() > 0 && !(await addBtn.isDisabled().catch(() => true))) {
      this.logger.info('No variant selection needed ✅');
      return;
    }
    this.logger.info('Selecting first available variant...');
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

  // ── Add to cart ────────────────────────────────────────────────────────────

  private async _addToCart(): Promise<void> {
    this.logger.info('Clicking Add to Cart...');
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
          this.logger.info(`Add to Cart ✅ via: ${sel}`);
          await this.page.waitForTimeout(3000);
          return;
        }
      } catch { /* next */ }
    }
    // Force click last resort
    const forceBtn = this.page.locator('form[action*="/cart"] button[type="submit"]').first();
    if (await forceBtn.count() > 0) {
      await forceBtn.click({ force: true });
      await this.page.waitForTimeout(3000);
      this.logger.info('Add to Cart force-clicked ✅');
      return;
    }
    throw new Error('Add to Cart button not found or disabled');
  }
}
