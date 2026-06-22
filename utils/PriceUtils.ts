/**
 * utils/PriceUtils.ts — All monetary calculations
 * No price logic anywhere else in the framework.
 */
export class PriceUtils {
  /** "$12.99" → 12.99 | "£1,299.00" → 1299.00 */
  static getNumericValue(raw: string): number {
    if (!raw || !raw.trim()) return 0;
    const cleaned = raw.replace(/[^0-9.]/g, '');
    const val     = parseFloat(cleaned);
    return isNaN(val) ? 0 : val;
  }

  /** (price × pct) / 100  e.g. 100 × 5 / 100 = 5.00 */
  static calculateDiscount(price: number, pct: number): number {
    return Math.round((price * pct / 100) * 100) / 100;
  }

  /** price × qty */
  static calculateSubtotal(price: number, qty: number): number {
    return Math.round(price * qty * 100) / 100;
  }

  /** subtotal - discount */
  static calculateGrandTotal(subtotal: number, discount: number): number {
    return Math.round((subtotal - discount) * 100) / 100;
  }

  static format(v: number): string { return `$${v.toFixed(2)}`; }
}
