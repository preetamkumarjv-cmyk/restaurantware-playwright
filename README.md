# 🎭 RestaurantWare Playwright Automation Framework

![Playwright](https://img.shields.io/badge/Playwright-1.44.0-06B6D4?style=for-the-badge&logo=playwright)
![TypeScript](https://img.shields.io/badge/TypeScript-5.4.5-3178C6?style=for-the-badge&logo=typescript)
![Node](https://img.shields.io/badge/Node.js-LTS-339933?style=for-the-badge&logo=node.js)
![Allure](https://img.shields.io/badge/Allure-Reporter-orange?style=for-the-badge)

> **Enterprise-grade Playwright + TypeScript POM framework for RestaurantWare E2E checkout testing.**

---

## 📋 Framework Overview

This framework implements a production-ready Page Object Model (POM) automation framework covering the complete RestaurantWare checkout flow — from category navigation to coupon validation.

**Test Scenario Covered:**
1. Launch https://www.restaurantware.com
2. Navigate to **BASIC NATURE** category
3. Add first product to cart → capture name, price, quantity
4. Verify **Mini Cart** — name, price, qty, subtotal
5. Click **Go To Cart** → validate cart page details
6. Click **CHECKOUT** → apply coupon code `BASIC`
7. Verify **5% discount** applied correctly

---

## 📁 Project Structure

```
restaurantware-playwright/
│
├── 📂 tests/
│   └── checkout.spec.ts          ← Main E2E test (8 steps)
│
├── 📂 pages/
│   ├── HomePage.ts               ← Homepage navigation & overlay handling
│   ├── ProductListingPage.ts     ← Category page — product capture & add to cart
│   ├── MiniCartComponent.ts      ← Mini cart drawer/notification
│   ├── CartPage.ts               ← /cart page validation
│   └── CheckoutPage.ts           ← Shopify checkout — coupon & discount
│
├── 📂 components/
│   └── HeaderComponent.ts        ← Global nav — category click
│
├── 📂 fixtures/
│   └── baseFixture.ts            ← All page objects injected via fixture
│
├── 📂 test-data/
│   └── checkoutData.json         ← All test data (coupon, %, category)
│
├── 📂 utils/
│   ├── PriceUtils.ts             ← Price parsing, discount, subtotal calc
│   ├── Logger.ts                 ← Structured console logging
│   └── CommonUtils.ts            ← Reusable helpers (wait, scroll, text)
│
├── 📂 constants/
│   └── Environment.ts            ← Base URL, routes, timeouts
│
├── playwright.config.ts          ← Config: reporters, retries, browsers
├── tsconfig.json                 ← TypeScript strict mode
├── package.json                  ← Scripts and dependencies
└── README.md                     ← This file
```

---

## 🛠️ Installation

### Prerequisites
- Node.js LTS (18+): https://nodejs.org
- npm 9+

### Steps

```bash
# 1. Clone / extract project
cd restaurantware-playwright

# 2. Install dependencies
npm install

# 3. Install Playwright browsers
npx playwright install chromium

# 4. Install Allure CLI (for reports)
npm install -g allure-commandline
```

---

## ▶️ Running Tests

```bash
# Run all tests (headless)
npm run test

# Run with browser visible
npm run test:headed

# Run checkout test specifically
npm run test:checkout

# Debug mode
npm run test:debug
```

---

## 📊 Reports

### HTML Report
```bash
npm run test
npm run report
# Opens: reports/html-report/index.html
```

### Allure Report
```bash
# Run tests first
npm run test

# Generate Allure report
npm run allure

# Open Allure report in browser
npm run allure:open

# OR serve directly (no generate step)
npm run allure:serve
```

---

## 🧪 Test Data

All test values are stored in `test-data/checkoutData.json`:

```json
{
  "couponCode":         "BASIC",
  "discountPercentage": 5,
  "expectedQuantity":   1,
  "category":           "Basic Nature"
}
```

**No hardcoded values exist in page classes or test files.**

---

## 💡 Key Design Decisions

### Page Object Model (POM)
- Each page has **Locators**, **Actions**, and **Getter** methods
- **No assertions inside page classes** — all assertions in test file
- Fixture auto-injects all page objects into tests

### Multi-Strategy Selectors
Every locator has 3–5 fallback selectors for resilience:
```typescript
this.discountInput = page.locator(
  '#checkout_reduction_code, input[name="discount"], ' +
  'input[placeholder*="Discount" i], input[id*="discount" i]'
).first();
```

### Price Utilities
All monetary calculations use `PriceUtils`:
```typescript
PriceUtils.calculateDiscount(price, 5)  // → (price × 5) / 100
PriceUtils.calculateSubtotal(price, 1)  // → price × qty
PriceUtils.calculateGrandTotal(sub, discount) // → sub - discount
PriceUtils.getNumericValue("$12.99")    // → 12.99
```

---

## ⚙️ Configuration (playwright.config.ts)

| Setting | Value |
|---|---|
| Base URL | https://www.restaurantware.com |
| Browsers | Chromium |
| Headless | true (false with `--headed`) |
| Retries | 1 (local) / 2 (CI) |
| Reporters | HTML + Allure + List |
| Screenshot | On failure |
| Video | On failure |
| Trace | On failure |
| Test timeout | 90 seconds |

---

## 🔄 CI/CD — GitHub Actions

```yaml
name: Playwright E2E Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Run tests
        run: npm run test

      - name: Upload HTML report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-html-report
          path: reports/html-report/

      - name: Upload Allure results
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: allure-results
          path: allure-results/

      - name: Upload test results
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: test-results
          path: test-results/
```

---

## 📐 Best Practices

| ✅ Do | ❌ Don't |
|---|---|
| Use POM pattern | Put assertions in page classes |
| Import from `baseFixture` | Import from `@playwright/test` directly |
| Use `PriceUtils` for maths | Hardcode price calculations in tests |
| Use `Logger` for output | Use `console.log` directly |
| Use `CommonUtils.isVisible()` | Use `page.waitForTimeout()` for sync |
| Keep test data in JSON | Hardcode values in spec files |
| Use `toBeCloseTo()` for prices | Use `toBe()` for floating point |

---

## 📈 Scalability

- Add new page objects in `/pages`
- Add new components in `/components`
- Add test data in `/test-data/*.json`
- Register new fixtures in `fixtures/baseFixture.ts`
- Add new specs in `/tests`

---

## 👤 Author

**Preetam Kumar J V** — Quality Analyst Lead  
preetamkumarjv@gmail.com | linkedin.com/in/preetamkumar-jv/
