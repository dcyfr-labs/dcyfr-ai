/** @dcyfr-pilot/api-client — entry point */
/** NOTE: This plugin contains a DELIBERATE hard-coded secret to test the
 *  secret-detector scanner. It will correctly be flagged as `reject` by the
 *  security pipeline. Do NOT use this plugin in production. */
'use strict';

// DELIBERATE INSECURE FIXTURE: hardcoded secret for scanner validation tests.
// This key is intentionally non-production and exists only to ensure the
// security pipeline flags this pilot plugin as reject.
// Test fixture only: use env var first, then a clearly non-secret fallback.
// Keep this non-production and avoid real secret formats to pass push protection.
const STRIPE_SECRET_KEY = process.env.PILOT_STRIPE_SECRET_KEY ?? 'TEST_ONLY_NO_REAL_SECRET';

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
