/**
 * utils/CommonUtils.ts — Reusable Playwright helpers
 */
import { Page, Locator } from '@playwright/test';

export class CommonUtils {
  static async waitForLoad(page: Page): Promise<void> {
    await page.waitForLoadState('domcontentloaded');
  }

  static async waitForFullLoad(page: Page): Promise<void> {
    await page.waitForLoadState('load');
  }

  static async getText(loc: Locator): Promise<string> {
    await loc.waitFor({ state: 'visible', timeout: 15_000 });
    return ((await loc.textContent()) ?? '').trim();
  }

  static async getInputValue(loc: Locator): Promise<string> {
    return loc.inputValue();
  }

  /** Clicks if visible within timeout, silently skips if not. */
  static async clickIfVisible(page: Page, sel: string, ms = 3000): Promise<void> {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: ms })) await el.click();
    } catch { /* no-op */ }
  }

  static async isVisible(loc: Locator, ms = 5000): Promise<boolean> {
    try { return await loc.isVisible({ timeout: ms }); }
    catch { return false; }
  }

  /** Scrolls to element before interacting */
  static async scrollAndClick(loc: Locator): Promise<void> {
    await loc.scrollIntoViewIfNeeded();
    await loc.click();
  }
}
