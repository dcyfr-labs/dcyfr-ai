/**
 * Signature Verifier
 *
 * Verifies cryptographic signatures on plugin artifacts using cosign.
 * A valid signature increases the trust score by 20 points; absence/invalid
 * decreases it by 20 points.
 *
 * @module plugins/security/signature-verifier
 * @version 1.0.0
 * @date 2026-02-28
 * @license MIT
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { SignatureVerificationResult } from './types.js';

const execFileAsync = promisify(execFile);

/** Timeout in milliseconds for cosign verification */
const COSIGN_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout after ${ms}ms`)),
      ms,
    );
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Verify the cosign signature on a plugin artifact.
 *
 * @param artifactPath  Absolute path to the plugin artifact (tarball, zip, etc.)
 * @param publicKeyPath Path to the DCYFR cosign public key file (.pub)
 */
export async function verifySignature(
  artifactPath: string,
  publicKeyPath: string,
): Promise<SignatureVerificationResult> {
  if (!artifactPath || !publicKeyPath) {
    return {
      success: false,
      verified: false,
      error: 'artifactPath and publicKeyPath are required',
    };
  }

  try {
    const verifyPromise = execFileAsync('cosign', [
      'verify-blob',
      '--key',
      publicKeyPath,
      '--signature',
      `${artifactPath}.sig`,
      artifactPath,
    ]);

    const { stdout } = await withTimeout(verifyPromise, COSIGN_TIMEOUT_MS);

    // cosign outputs signature metadata on success
    const keyFingerprint = /Certificate fingerprint: ([A-Fa-f0-9:]+)/.exec(stdout)?.[1];
    const signedAt = /Signed at: (.+)/.exec(stdout)?.[1];

    return {
      success: true,
      verified: true,
      publicKeyFingerprint: keyFingerprint,
      signedAt,
    };
  } catch (err) {
    const message = String(err);
    const timedOut = message.includes('Timeout after');
    return {
      success: !timedOut,
      verified: false,
      timedOut,
      error: message,
    };
  }
}
