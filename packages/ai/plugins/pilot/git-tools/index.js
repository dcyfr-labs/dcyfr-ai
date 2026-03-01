/** @dcyfr-pilot/git-tools — entry point */
'use strict';

/**
 * Returns a summary of recent commits in the project.
 * Uses git log to read history.
 *
 * @param {string} projectPath - Path to the git repository root
 * @param {number} [limit=10] - Number of commits to return
 * @returns {Promise<string[]>} Commit messages
 */
async function getRecentCommits(projectPath, limit = 10) {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(execFile);

  const { stdout } = await execFileAsync('git', [
    '-C', projectPath,
    'log', '--oneline', `-${limit}`,
  ]);
  return stdout.trim().split('\n').filter(Boolean);
}

/**
 * Returns the current branch name.
 *
 * @param {string} projectPath - Path to the git repository root
 * @returns {Promise<string>} Current branch
 */
async function getCurrentBranch(projectPath) {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(execFile);

  const { stdout } = await execFileAsync('git', [
    '-C', projectPath,
    'rev-parse', '--abbrev-ref', 'HEAD',
  ]);
  return stdout.trim();
}

export { getRecentCommits, getCurrentBranch };
