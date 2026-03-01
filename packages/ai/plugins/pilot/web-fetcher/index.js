/** @dcyfr-pilot/web-fetcher — entry point */
'use strict';

/**
 * Fetch data from an allowed external API.
 *
 * @param {string} url - URL to fetch (must match allowedDomains)
 * @param {RequestInit} [options] - Fetch options
 * @returns {Promise<unknown>} Parsed JSON response
 */
async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'dcyfr-plugin-web-fetcher/1.2.0',
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch GitHub repository metadata.
 *
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @returns {Promise<Record<string, unknown>>} Repository metadata
 */
async function fetchGitHubRepo(owner, repo) {
  return fetchJson(`https://api.github.com/repos/${owner}/${repo}`);
}

export { fetchJson, fetchGitHubRepo };
