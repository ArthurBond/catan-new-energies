/**
 * Publishes the committed project to GitHub as one new commit on origin/main; the Pages workflow
 * (.github/workflows/deploy-pages.yml) then builds and deploys the site.
 *
 * Only the files tracked at HEAD go out. The local commit history, and everything in .gitignore
 * (agent notes, design references, planning docs), never leave this machine.
 *
 *   npm run publish:pages
 */
import { execFileSync } from 'node:child_process';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

if (git('status', '--porcelain', '--untracked-files=no')) {
  console.error('Commit (or stash) your changes first: only committed work is published.');
  process.exit(1);
}

let parent = null;
try {
  git('fetch', 'origin', 'main');
  parent = git('rev-parse', '--verify', 'origin/main');
} catch {
  // First publish: there is no main branch on GitHub yet
}

const tree = git('rev-parse', 'HEAD^{tree}');
if (parent && git('rev-parse', `${parent}^{tree}`) === tree) {
  console.log('GitHub already has this version. Nothing to publish.');
  process.exit(0);
}

const subject = git('log', '-1', '--format=%s');
const commit = git('commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', `Publish: ${subject}`);
git('push', 'origin', `${commit}:refs/heads/main`);
console.log(`Published ${commit.slice(0, 7)} to origin/main. The site redeploys in a minute or two.`);
