var test = require('node:test');
var assert = require('node:assert/strict');

var inventory = require('../lib/inventory');
var invoice = require('../lib/invoice');
var ledger = require('../lib/ledger');
var orders = require('../lib/orders');
var pricing = require('../lib/pricing');
var reports = require('../lib/reports');
var tax = require('../lib/tax');

test('HSN slabs set order GST rates and unknown HSNs use the configured fallback', function () {
  assert.equal(tax.getSlabPercent({ hsn: '1006' }), 5);
  assert.equal(tax.getSlabPercent({ hsn: '0405' }), 12);
  assert.equal(tax.getSlabPercent({ hsn: '9999' }), 18);

  var totals = pricing.computeTotals([
    { id: 1, name: 'Rice', hsn: '1006', price: 100, qty: 1 }
  ], '');
  assert.deepEqual(
    { subtotal: totals.subtotal, tax: totals.tax, total: totals.total },
    { subtotal: 100, tax: 5, total: 105 }
  );
});

test('coupon discounts are applied to subtotal before order GST is calculated', function () {
  var totals = pricing.computeTotals([
    { id: 1, name: 'Rice', hsn: '1006', price: 1000, qty: 1 }
  ], ' save10 ');

  assert.equal(totals.discount, 100);
  assert.equal(totals.tax, 45);
  assert.equal(totals.total, 945);
});

test('invoice figures match the customer billed order totals and HSN GST breakdown', function () {
  var item = { id: 1, name: 'Rice', hsn: '1006', price: 1000, qty: 1 };
  var orderTotals = pricing.computeTotals([item], 'SAVE10');
  var order = Object.assign({ id: 7, items: [item], coupon: 'SAVE10' }, orderTotals);
  var invoiceTotals = invoice.computeInvoiceFigures(order);

  assert.deepEqual(
    {
      subtotal: orderTotals.subtotal,
      discount: orderTotals.discount,
      tax: orderTotals.tax,
      total: orderTotals.total
    },
    { subtotal: 1000, discount: 100, tax: 45, total: 945 }
  );
  assert.deepEqual(
    {
      subtotal: invoiceTotals.subtotal,
      discount: invoiceTotals.discount,
      tax: invoiceTotals.tax,
      cgst: invoiceTotals.cgst,
      sgst: invoiceTotals.sgst,
      total: invoiceTotals.total,
      rowGstPercent: invoiceTotals.rows[0].gstPercent,
      rowTax: invoiceTotals.rows[0].lineTax
    },
    { subtotal: 1000, discount: 100, tax: 45, cgst: 22.5, sgst: 22.5, total: 945, rowGstPercent: 5, rowTax: 45 }
  );

  var reconciliation = reports.getGstReconciliation({ orders: [order] });
  assert.equal(reconciliation.mismatchCount, 0);
  assert.deepEqual(
    {
      invoiceDiscount: reconciliation.rows[0].invoiceDiscount,
      invoiceTax: reconciliation.rows[0].invoiceTax,
      invoiceTotal: reconciliation.rows[0].invoiceTotal,
      delta: reconciliation.rows[0].delta,
      matched: reconciliation.rows[0].matched
    },
    { invoiceDiscount: 100, invoiceTax: 45, invoiceTotal: 945, delta: 0, matched: true }
  );
});

test('invoice renderer displays the order-aligned GST, total and no reconciliation warning', function () {
  var item = { id: 1, name: 'Rice', hsn: '1006', price: 1000, qty: 1 };
  var orderTotals = pricing.computeTotals([item], 'SAVE10');
  var order = Object.assign({ id: 8, items: [item], coupon: 'SAVE10' }, orderTotals);
  var rendered = invoice.render(order);
  var invoiceTotals = invoice.computeInvoiceFigures(order);

  assert.equal(orderTotals.tax, 45);
  assert.equal(invoiceTotals.rows[0].line, 1000);
  assert.equal(invoiceTotals.rows[0].lineTax, 45);
  assert.match(rendered, /GST Amt<\/th>/);
  assert.match(rendered, /Invoice Total<\/td><td class="r">[^<]*945\.00/);
  assert.doesNotMatch(rendered, /differs from Order Ledger recorded total/);
});

test('invoice figures resolve HSN slabs when an order line omits gstRate', function () {
  var item = { id: 2, name: 'Unmapped item', hsn: '9999', price: 100, qty: 1 };
  var invoiceTotals = invoice.computeInvoiceFigures({ items: [item], coupon: '' });

  assert.equal(tax.getSlabPercent(item), 18);
  assert.equal(invoiceTotals.rows[0].gstPercent, 18);
  assert.equal(invoiceTotals.tax, 18);
  assert.equal(invoiceTotals.total, 118);
});

test('inventory rejects an order that would consume every sellable unit', function () {
  var products = [{ id: 1, name: 'Rice', stock: 5, reserved: 2 }];

  assert.deepEqual(inventory.check(products, [{ id: 1, qty: 3 }]), {
    ok: false,
    msg: 'Rice is out of stock (3 sellable available)'
  });
  assert.deepEqual(inventory.check(products, [{ id: 1, qty: 2 }]), { ok: true });
});

test('cancelling a khata order reverses the ledger debit but currently leaves deducted stock unchanged', function () {
  var db = {
    nextOrderId: 1,
    orders: [],
    products: [{ id: 1, name: 'Rice', stock: 4, reserved: 0 }],
    customers: [{ id: 2, name: 'Asha', creditLimit: 1000, openingBalance: 0, totalBilled: 0, totalSettled: 0 }]
  };
  var item = { id: 1, name: 'Rice', price: 100, qty: 1 };
  var charge = ledger.chargeOrderToKhata(db, 2, 100);
  assert.equal(charge.ok, true);
  inventory.reserve(db.products, [item]);
  var order = orders.add(db, {
    customer: 'Asha', customerId: 2, paymentMode: 'khata', items: [item], total: 100
  });

  assert.equal(orders.cancel(db, order.id, 'Return').ok, true);
  assert.equal(db.customers[0].totalBilled, 0);
  assert.equal(db.products[0].stock, 3);
  assert.equal(order.status, 'cancelled');
});
