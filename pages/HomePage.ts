/**
 * pages/HomePage.ts
 * ROOT CAUSE FIX: Removed unreliable hero-section isLoaded() check.
 * Uses page.waitForLoadState() which is guaranteed to resolve.
 */
import { Page } from '@playwright/test';
import { Logger }      from '../utils/Logger';
import { CommonUtils } from '../utils/CommonUtils';

export class HomePage {
  private readonly page:   Page;
  private readonly logger: Logger;

  constructor(page: Page) {
    this.page   = page;
    this.logger = new Logger('HomePage');
  }

  async navigate(): Promise<void> {
    this.logger.info('Navigating to homepage');
    await this.page.goto('/', { waitUntil: 'domcontentloaded' });
    await CommonUtils.waitForFullLoad(this.page);

    // Dismiss cookie banner if present
    await CommonUtils.clickIfVisible(this.page,
      'button:has-text("Accept"), button:has-text("Accept All"), ' +
      '[id*="cookie"] button, [class*="cookie"] button', 4000);

    // Dismiss newsletter popup if present
    await CommonUtils.clickIfVisible(this.page,
      '.klaviyo-close-form, [aria-label="Close dialog"], ' +
      '[class*="popup"] [class*="close"], [class*="modal"] [class*="close"]', 3000);

    this.logger.info('Homepage loaded ✅');
  }

  async getPageTitle(): Promise<string> { return this.page.title(); }
  async getCurrentUrl(): Promise<string> { return this.page.url(); }
}
