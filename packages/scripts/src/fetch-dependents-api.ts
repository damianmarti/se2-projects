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

import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error('GITHUB_TOKEN is required. Set it in your environment.');
  process.exit(1);
}

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

const headers: Record<string, string> = {
  Authorization: `token ${token}`,
  Accept: 'application/vnd.github.v3+json',
  'User-Agent': 'dependents-fetch-script',
};

type RepoMeta = {
  full_name: string;
  name: string;
  owner: { login: string };
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  fork: boolean;
};

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function searchCodeOnce(q: string, page: number): Promise<any> {
  const url = `https://api.github.com/search/code?q=${encodeURIComponent(q)}&per_page=100&page=${page}`;
  const res = await fetch(url, { headers });
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

  for (const term of SEARCH_TERMS) {
    for (const fileTarget of FILE_TARGETS) {
      for (const pathShard of PATH_SHARDS) {
        // Note: Avoid using fork:false in code search queries to prevent 422 parsing errors.
        const baseQuery = [term, 'in:file', fileTarget, pathShard].filter(Boolean).join(' ');
        console.log(`Searching: ${baseQuery}`);

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

async function fetchRepoMeta(fullName: string): Promise<RepoMeta | null> {
  const url = `https://api.github.com/repos/${fullName}`;
  const res = await fetch(url, { headers });
  if (res.status === 403) {
    // Rate limit - back off
    const reset = res.headers.get('x-ratelimit-reset');
    const nowSec = Math.floor(Date.now() / 1000);
    const waitMs = reset ? (parseInt(reset, 10) - nowSec + 2) * 1000 : 30_000;
    console.warn(`Rate limited on repo meta (${fullName}). Waiting ${Math.max(waitMs, 5000)}ms...`);
    await delay(Math.max(waitMs, 5000));
    return fetchRepoMeta(fullName);
  }
  if (!res.ok) {
    console.warn(`Failed to fetch repo meta for ${fullName}: ${res.status}`);
    return null;
  }
  return res.json();
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T, idx: number) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let idx = 0;
  let active = 0;

  return new Promise((resolve, reject) => {
    const next = () => {
      if (idx >= items.length && active === 0) {
        resolve(results);
        return;
      }
      while (active < limit && idx < items.length) {
        const currentIndex = idx++;
        active++;
        mapper(items[currentIndex], currentIndex)
          .then(res => { results[currentIndex] = res; })
          .catch(err => { reject(err); })
          .finally(() => { active--; next(); });
      }
    };
    next();
  });
}

function toCsvValue(val: string | number): string {
  if (typeof val === 'number') return String(val);
  const escaped = (val || '').replace(/"/g, '""');
  return `"${escaped}"`;
}

async function main() {
  console.log('Collecting repositories referencing the package in manifests/lockfiles...');
  const repos = await searchRepositories();
  console.log(`Found ${repos.length} unique repositories.`);

  if (repos.length === 0) {
    console.log('No repositories found. Exiting.');
    return;
  }

  console.log('Fetching repository metadata (stars, forks)...');
  const metas = await mapWithConcurrency(repos, 8, async (fullName) => {
    const meta = await fetchRepoMeta(fullName);
    // Friendly pacing between bursts
    await delay(150);
    return meta;
  });

  const rows = metas
    .filter((m): m is RepoMeta => Boolean(m))
    // If INCLUDE_FORKS is false, remove forks post-fetch to avoid 422s in code search
    .filter(m => includeForks ? true : !m.fork)
    .map(m => ({
      full_name: m.full_name,
      name: m.name,
      owner: m.owner.login,
      url: m.html_url,
      stars: m.stargazers_count,
      forks: m.forks_count,
    }))
    // Sort by stars desc, then name
    .sort((a, b) => (b.stars - a.stars) || a.full_name.localeCompare(b.full_name));

  const csvLines: string[] = [
    'full_name,name,owner,url,stars,forks',
    ...rows.map(r => [
      toCsvValue(r.full_name),
      toCsvValue(r.name),
      toCsvValue(r.owner),
      toCsvValue(r.url),
      String(r.stars),
      String(r.forks),
    ].join(',')),
  ];

  const outPath = 'dependents_api.csv';
  fs.writeFileSync(outPath, csvLines.join('\n'));
  console.log(`Saved ${rows.length} repositories to ${outPath}`);
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
