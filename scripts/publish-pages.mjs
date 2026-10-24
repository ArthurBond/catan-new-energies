/**
 * Publishes the game to GitHub in one push:
 *   - main:     the committed source, as one new commit (only files tracked at HEAD)
 *   - gh-pages: the built site, which GitHub Pages serves at https://<user>.github.io/<repo>/
 *
 * The local commit history, and everything in .gitignore (agent notes, design references,
 * planning docs), never leave this machine.
 *
 *   npm run publish:pages
 */
import { execFileSync, execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const git = (args, env = process.env) =>
  execFileSync('git', args, { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] }).trim();

if (git(['status', '--porcelain', '--untracked-files=no'])) {
  console.error('Commit (or stash) your changes first: only committed work is published.');
  process.exit(1);
}

const repo = git(['remote', 'get-url', 'origin']).replace(/\.git$/, '').split('/').pop();
const remoteHead = (branch) => {
  try {
    git(['fetch', 'origin', branch]);
    return git(['rev-parse', '--verify', `origin/${branch}`]);
  } catch {
    return null; // first publish: the branch does not exist on GitHub yet
  }
};

/** A new commit for `tree` on top of `parent`, or null when the branch already has that tree. */
const snapshot = (tree, parent, message) => {
  if (parent && git(['rev-parse', `${parent}^{tree}`]) === tree) return null;
  return git(['commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', message]);
};

// Build the site for https://<user>.github.io/<repo>/
execSync('npm run build', { stdio: 'inherit', env: { ...process.env, PAGES_BASE: `/${repo}/` } });
writeFileSync('dist/.nojekyll', ''); // serve the files as they are

// Turn dist/ into a tree with a throwaway index, leaving the real index and working tree alone
const scratch = mkdtempSync(join(tmpdir(), 'publish-pages-'));
const indexEnv = { ...process.env, GIT_INDEX_FILE: join(scratch, 'index') };
git(['--work-tree=dist', 'add', '--all', '.'], indexEnv);
const siteTree = git(['write-tree'], indexEnv);
rmSync(scratch, { recursive: true, force: true });

const subject = git(['log', '-1', '--format=%s']);
const source = snapshot(git(['rev-parse', 'HEAD^{tree}']), remoteHead('main'), `Publish: ${subject}`);
const site = snapshot(siteTree, remoteHead('gh-pages'), `Site build: ${subject}`);

const refspecs = [...(source ? [`${source}:refs/heads/main`] : []), ...(site ? [`${site}:refs/heads/gh-pages`] : [])];
if (refspecs.length === 0) {
  console.log('GitHub already has this version. Nothing to publish.');
  process.exit(0);
}
git(['push', 'origin', ...refspecs]);
console.log(`Published to https://github.com/${git(['remote', 'get-url', 'origin']).replace(/^.*github\.com[/:]/, '').replace(/\.git$/, '')}`);
console.log('GitHub Pages updates the site within a minute or two.');
