/** @dcyfr-pilot/api-client — entry point */
/** NOTE: This plugin contains a DELIBERATE hard-coded secret to test the
 *  secret-detector scanner. It will correctly be flagged as `reject` by the
 *  security pipeline. Do NOT use this plugin in production. */
'use strict';

// SECURITY: API key injected via environment variable (see .env.example)
// For testing the secret-detector scanner, set STRIPE_SECRET_KEY in environment
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';

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
