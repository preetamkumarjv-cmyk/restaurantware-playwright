/**
 * constants/Environment.ts
 * Single source of truth for all environment constants.
 * No hardcoded values allowed anywhere else.
 */
export const Environment = {
  BASE_URL:  'https://www.restaurantware.com',

  // ── Routes ───────────────────────────────────────────────────────────────
  CART_URL:     '/cart',
  CHECKOUT_URL: '/checkout',

  // ── Category ─────────────────────────────────────────────────────────────
  BASIC_NATURE_CATEGORY: 'Basic Nature',
  BASIC_NATURE_HREF:     '/collections/basic-nature',

  // ── Timeouts (ms) ────────────────────────────────────────────────────────
  SHORT_WAIT:   3_000,
  DEFAULT_WAIT: 10_000,
  LONG_WAIT:    30_000,

  // ── Coupon ───────────────────────────────────────────────────────────────
  COUPON_FIELD_LABEL: 'Discount code or gift card',

} as const;

export type EnvironmentKeys = keyof typeof Environment;
