/**
 * fixtures/baseFixture.ts — exposes `page` in addition to all page objects
 */
import { test as base, expect } from '@playwright/test';
import { HomePage }             from '../pages/HomePage';
import { ProductListingPage }   from '../pages/ProductListingPage';
import { MiniCartComponent }    from '../pages/MiniCartComponent';
import { CartPage }             from '../pages/CartPage';
import { CheckoutPage }         from '../pages/CheckoutPage';
import { HeaderComponent }      from '../components/HeaderComponent';

type PageFixtures = {
  homePage:           HomePage;
  productListingPage: ProductListingPage;
  miniCart:           MiniCartComponent;
  cartPage:           CartPage;
  checkoutPage:       CheckoutPage;
  header:             HeaderComponent;
};

export const test = base.extend<PageFixtures>({
  homePage:           async ({ page }, use) => use(new HomePage(page)),
  productListingPage: async ({ page }, use) => use(new ProductListingPage(page)),
  miniCart:           async ({ page }, use) => use(new MiniCartComponent(page)),
  cartPage:           async ({ page }, use) => use(new CartPage(page)),
  checkoutPage:       async ({ page }, use) => use(new CheckoutPage(page)),
  header:             async ({ page }, use) => use(new HeaderComponent(page)),
});

export { expect };
