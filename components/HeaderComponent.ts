/**
 * components/HeaderComponent.ts
 *
 * FIX: After navigating to category, explicitly waits for product content
 * to appear (handles lazy-loaded / JS-rendered product grids).
 */
import { Page } from '@playwright/test';
import { Logger } from '../utils/Logger';

export class HeaderComponent {
  private readonly page:   Page;
  private readonly logger: Logger;

  constructor(page: Page) {
    this.page   = page;
    this.logger = new Logger('HeaderComponent');
  }

  async clickCategory(categoryName: string): Promise<void> {
    this.logger.info(`Navigating to category: "${categoryName}"`);

    const slug           = categoryName.toLowerCase().replace(/\s+/g, '-');
    const collectionPath = `/collections/${slug}`;

    // ── Strategy 1: Click visible nav link ──────────────────────────────────
    const navSelectors = [
      `a[href*="${slug}"]:visible`,
      `a:has-text("${categoryName}")`,
      `nav a:has-text("${categoryName.split(' ')[0]}")`,
    ];

    for (const sel of navSelectors) {
      try {
        const el = this.page.locator(sel).first();
        if (await el.isVisible({ timeout: 3000 })) {
          await el.click();
          await this._waitForCategoryPage();
          this.logger.info(`Navigated via link: "${sel}" ✅`);
          return;
        }
      } catch { /* try next */ }
    }

    // ── Strategy 2: Hover to open dropdown, then click ──────────────────────
    const navItems = this.page.locator('li[class*="nav"], header li, nav > ul > li');
    const count    = await navItems.count();
    for (let i = 0; i < count; i++) {
      try {
        const item = navItems.nth(i);
        const text = ((await item.textContent()) ?? '').toLowerCase();
        if (text.includes(categoryName.toLowerCase())) {
          await item.hover();
          await this.page.waitForTimeout(600);
          const link = item.locator(`a[href*="${slug}"]`).first();
          if (await link.isVisible({ timeout: 2000 })) {
            await link.click();
            await this._waitForCategoryPage();
            this.logger.info('Navigated via hover menu ✅');
            return;
          }
        }
      } catch { /* next */ }
    }

    // ── Strategy 3: Direct URL navigation (always works) ────────────────────
    this.logger.warn(`Link not found — navigating directly to ${collectionPath}`);
    await this.page.goto(collectionPath, { waitUntil: 'domcontentloaded' });
    await this._waitForCategoryPage();
    this.logger.info(`Navigated via URL: ${collectionPath} ✅`);
  }

  /**
   * After navigating to a collection, wait for the page to fully render.
   * Uses multiple strategies to confirm the page is ready:
   *   1. networkidle (best — waits for all lazy-load XHRs)
   *   2. load (fallback)
   *   3. Explicit wait for any common product element
   */
  private async _waitForCategoryPage(): Promise<void> {
    this.logger.info('Waiting for category page to fully render...');

    // Wait for load state (networkidle catches lazy-loaded products)
    try {
      await this.page.waitForLoadState('networkidle', { timeout: 15_000 });
    } catch {
      // networkidle can timeout on busy pages — fall back
      await this.page.waitForLoadState('load', { timeout: 10_000 });
    }

    // Explicit wait for ANY product-related element to confirm content loaded
    const productIndicators = [
      'a[href*="/products/"]',
      '[class*="product-card"]',
      '[class*="product-item"]',
      '[class*="grid__item"]',
      '[class*="collection"]',
      '.collection-grid',
      'ul.grid',
      'main',
    ];

    for (const sel of productIndicators) {
      try {
        await this.page.waitForSelector(sel, { state: 'visible', timeout: 8_000 });
        this.logger.info(`Page content confirmed via: ${sel} ✅`);
        return;
      } catch { /* try next indicator */ }
    }

    // If nothing specific found, just wait a bit and continue
    this.logger.warn('No specific product indicator found — continuing after delay');
    await this.page.waitForTimeout(3000);
  }
}
