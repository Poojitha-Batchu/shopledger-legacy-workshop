# Repository Guidelines

## What the App Does

ShopLedger is a single-process Express app serving a browser POS from `public/` and JSON endpoints under `/api`. `server.js` mounts handlers in `routes/`; business rules live in `lib/`. Flows include product lookup, order creation/history/cancellation, customer Khata and settlements, dashboard/GST reports, and printable invoices at `/orders/:id/invoice`.

## Data and Order Behavior

`data/db.json` is the live datastore. `lib/store.js` synchronously reads and rewrites the whole file; there is no database server or migration runner. Keep test fixtures in memory. Pricing applies coupon discounts to subtotal, apportions the discount across lines, then calculates GST using the HSN slab (5%, 12%, or the 18% fallback). Khata orders charge a customer balance subject to its credit limit. Admin export is at `/api/admin/export?key=...`; its key is hardcoded in `config.js`.

Invoice calculation is a separate path from order pricing. Current characterization tests record that invoices use the 18% fallback when order lines have HSN but no `gstRate`, and calculate percentage coupon discount on subtotal plus tax; GST reconciliation therefore reports a mismatch for those orders. Cancellation marks the order cancelled and reverses a Khata debit, but currently does not restore stock: order items use `id`, while inventory release looks for `productId`. These are observed behaviors and likely defects; change the tests when correcting them.

## Structure and Style

- `routes/`: Express endpoint handlers; `lib/`: pricing, tax, inventory, ledger, order, invoice, date, and report logic.
- `public/index.html`, `public/js/app.js`, `public/css/style.css`: browser interface.
- `test/core.test.js`: Node built-in test runner characterization tests.

Use CommonJS, two-space indentation, lowercase descriptive filenames, and camelCase names. Keep HTTP concerns in routes and calculations in `lib/`. The codebase mostly uses `var`; follow surrounding code.

## Development and Tests

- `npm install` installs dependencies.
- `npm start` serves the app on port 3000, overridable with `PORT`.
- `npm test` runs `node --test` against the in-memory business-rule tests.

Add tests for changed behavior and related order, inventory, ledger, and invoice effects. Do not write to `data/db.json` in tests. No isolated integration datastore, formatter, or linter is configured.

## Commits and Pull Requests

Recent commits use short, lowercase summaries such as `invoice page for accountant`. Follow that style. PRs should describe the behavior change, mention test/manual checks, link an issue when relevant, and include screenshots for UI changes. Do not commit real customer data, credentials, or deployment secrets.
