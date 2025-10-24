/*
  Fetch repositories that depend on a given npm package/repo by querying
  GitHub's Search API for occurrences in manifest/lock files, then enrich
  each repository with stars and forks and write a CSV.

  Environment variables:
    - GITHUB_TOKEN: GitHub Personal Access Token (Classic or Fine-grained)
    - DEP_QUERY_TERMS (optional): Comma-separated search terms. Defaults to
      "@scaffold-eth/burner-connector,burner-connector"
    - INCLUDE_FORKS (optional): "true" to include forks in search
*/
import dotenv from 'dotenv';
import {
  pool,
  githubHeaders,
  delay,
  fetchRepoMeta,
  processRepositories,
  setupGracefulShutdown,
  type RepositoryData,
  type GitHubRepoResponse
} from './common';

dotenv.config();

// Default search terms cover scoped and unscoped names.
const defaultTerms = [
  '"@scaffold-eth/burner-connector"',
  '"burner-connector"',
];

const queryTerms = (process.env.DEP_QUERY_TERMS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const SEARCH_TERMS = queryTerms.length > 0 ? queryTerms : defaultTerms;

const FILE_TARGETS = [
  'filename:package.json',
  'filename:package-lock.json',
  'filename:yarn.lock',
  'filename:pnpm-lock.yaml',
];

const includeForks = String(process.env.INCLUDE_FORKS || 'false').toLowerCase() === 'true';
// Path shards help split results to avoid the 1000-result cap per query
const PATH_SHARDS = [
  '',
  'path:/',
  'path:/packages/',
  'path:/apps/',
  'path:/examples/',
  'path:/libs/',
  'path:/modules/',
  'path:/services/',
];

async function searchCodeOnce(q: string, page: number): Promise<any> {
  const url = `https://api.github.com/search/code?q=${encodeURIComponent(q)}&per_page=100&page=${page}`;
  const res = await fetch(url, { headers: githubHeaders });

  if (res.status === 403) {
    // Likely rate limited. Respect headers if available.
    const reset = res.headers.get('x-ratelimit-reset');
    const nowSec = Math.floor(Date.now() / 1000);
    const waitMs = reset ? (parseInt(reset, 10) - nowSec + 2) * 1000 : 30_000;
    console.warn(`Rate limited on search. Waiting ${Math.max(waitMs, 5000)}ms...`);
    await delay(Math.max(waitMs, 5000));
    return searchCodeOnce(q, page);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Search API error ${res.status}: ${text}`);
  }

  return res.json();
}

async function searchRepositories(): Promise<string[]> {
  const repoFullNames = new Set<string>();

  const totalCombinations = SEARCH_TERMS.length * FILE_TARGETS.length * PATH_SHARDS.length;
  let currentCombination = 0;

  for (const term of SEARCH_TERMS) {
    for (const fileTarget of FILE_TARGETS) {
      for (const pathShard of PATH_SHARDS) {
        currentCombination++;
        // Note: Avoid using fork:false in code search queries to prevent 422 parsing errors.
        const baseQuery = [term, 'in:file', fileTarget, pathShard].filter(Boolean).join(' ');
        console.log(`Searching: ${baseQuery} (${currentCombination} of ${totalCombinations})`);

        for (let page = 1; page <= 10; page++) {
          const data = await searchCodeOnce(baseQuery, page);
          const items = Array.isArray(data.items) ? data.items : [];
          if (items.length === 0) break;

          for (const it of items) {
            const repo = it.repository?.full_name;
            if (typeof repo === 'string') repoFullNames.add(repo);
          }

          await delay(300);
        }
      }
    }
  }

  return Array.from(repoFullNames);
}


async function main() {
  setupGracefulShutdown();

  console.log('Collecting repositories referencing the package in manifests/lockfiles...');
  const repos = await searchRepositories();
  console.log(`Found ${repos.length} unique repositories.`);

  if (repos.length === 0) {
    console.log('No repositories found. Exiting.');
    return;
  }

  console.log('Fetching repository metadata (stars, forks)...');
  const metas: (GitHubRepoResponse | null)[] = [];
  for (let i = 0; i < repos.length; i++) {
    const fullName = repos[i];
    console.log(`Processing ${fullName} (${i + 1} of ${repos.length})`);
    const meta = await fetchRepoMeta(fullName);
    metas.push(meta);
    // Friendly pacing between calls
    await delay(150);
  }

  const rows: RepositoryData[] = metas
    .filter((m): m is GitHubRepoResponse => Boolean(m))
    // If INCLUDE_FORKS is false, remove forks post-fetch to avoid 422s in code search
    .filter(m => includeForks ? true : !m.fork)
    .map(m => ({
      full_name: m.full_name,
      name: m.name,
      owner: m.owner.login,
      url: m.html_url,
      homepage: m.homepage,
      stars: m.stargazers_count,
      forks: m.forks_count,
      created_at: m.created_at,
      updated_at: m.updated_at,
      source: ['dependents-api'],
    }));

  await processRepositories(rows);

  await pool.end();
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
