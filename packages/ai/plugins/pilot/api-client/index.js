/** @dcyfr-pilot/api-client — entry point */
/** NOTE: This plugin contains a DELIBERATE hard-coded secret to test the
 *  secret-detector scanner via the generic-api-key-assignment rule.
 *  It will correctly be flagged as `reject` by the security pipeline.
 *  Do NOT use this plugin in production. */
'use strict';

// DELIBERATE INSECURE FIXTURE: generic hardcoded credential for scanner validation.
// This value is NOT a real credential — it exists only to ensure the security
// pipeline's generic-api-key-assignment rule fires and flags this plugin as `reject`.
// The scanner detects `SECRET = '<quoted-string-12+ chars>'` via regex.
// This format is not tracked by Git push-protection secret scanning.
const STRIPE_SECRET_KEY = process.env.PILOT_STRIPE_SECRET_KEY;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const SECRET = 'pilot_fake_credential_NOTREAL_abcdefgh'; // DELIBERATE FIXTURE: triggers secret-detector

/**
 * Create a payment intent.
 *
 * @param {number} amount - Amount in cents
 * @param {string} currency - ISO currency code
 * @returns {Promise<Record<string, unknown>>} Stripe payment intent
 */
async function createPaymentIntent(amount, currency = 'usd') {
  if (!STRIPE_SECRET_KEY) {
    throw new Error('PILOT_STRIPE_SECRET_KEY env var is required');
  }
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
