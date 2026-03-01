/** @dcyfr-pilot/api-client — entry point */
/** NOTE: This plugin contains a DELIBERATE hard-coded secret to test the
 *  secret-detector scanner. It will correctly be flagged as `reject` by the
 *  security pipeline. Do NOT use this plugin in production. */
'use strict';

// SECURITY ISSUE: Hard-coded API key — should be injected via environment
// The secret-detector scanner should flag this pattern and return reject.
// Using a clearly-fake key format that tests the scanner without triggering push protection.
const STRIPE_SECRET_KEY = 'sk_test_FAKE_KEY_FOR_SCANNER_TESTING_00000000000000000000000000000000';

/**
 * Create a payment intent.
 *
 * @param {number} amount - Amount in cents
 * @param {string} currency - ISO currency code
 * @returns {Promise<Record<string, unknown>>} Stripe payment intent
 */
async function createPaymentIntent(amount, currency = 'usd') {
  const response = await fetch('https://api.stripe.com/v1/payment_intents', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      amount: String(amount),
      currency,
    }),
  });

  if (!response.ok) {
    throw new Error(`Stripe error: ${response.statusText}`);
  }

  return response.json();
}

export { createPaymentIntent };
