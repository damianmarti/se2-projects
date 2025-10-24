/*
  Search repositories by filename and optional path shards using GitHub's
  Search API (code). Dedupe by repository and export CSV with repo metadata.

  Environment variables:
    - GITHUB_TOKEN (required)
    - FILENAME (default: scaffold.config.ts)
    - PATH_SHARDS (optional, comma-separated): e.g. "/nextjs/,/packages/nextjs/,/apps/nextjs/"
    - REQUIRED_PATH (optional, default: /nextjs/): only accept matches with this substring in path
    - SIZE_SHARDS (optional, comma-separated file size ranges for code search):
      e.g. "0..4096,4097..16384,16385..65536,>65536"
    - INCLUDE_FORKS (optional): "true" to include forks
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
} from './common';

dotenv.config();

const FILENAME = process.env.FILENAME || 'scaffold.config.ts';
const includeForks = String(process.env.INCLUDE_FORKS || 'false').toLowerCase() === 'true';
const pathShards = (process.env.PATH_SHARDS || '/nextjs/,/packages/nextjs/,/apps/nextjs/,/examples/nextjs/,/libs/nextjs/,/modules/nextjs/,/services/nextjs/')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
const requiredPath = (process.env.REQUIRED_PATH || '/nextjs/').toLowerCase();
const sizeShards = (process.env.SIZE_SHARDS || '0..4096,4097..16384,16385..65536,>65536')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

async function searchCode(q: string, page: number): Promise<any> {
  const url = `https://api.github.com/search/code?q=${encodeURIComponent(q)}&per_page=100&page=${page}`;
  const res = await fetch(url, { headers: githubHeaders });
  if (res.status === 403) {
    const reset = res.headers.get('x-ratelimit-reset');
    const nowSec = Math.floor(Date.now() / 1000);
    const waitMs = reset ? (parseInt(reset, 10) - nowSec + 2) * 1000 : 30_000;
    console.warn(`Rate limited. Waiting ${Math.max(waitMs, 5000)}ms...`);
    await delay(Math.max(waitMs, 5000));
    return searchCode(q, page);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Search API error ${res.status}: ${text}`);
  }
  return res.json();
}

async function main() {
  setupGracefulShutdown();

  console.log(`Searching for filename:${FILENAME} across path and size shards...`);
  const repos = new Set<string>();

  // Always run a generic filename search (no path) as well
  const shards = [''].concat(pathShards.map(p => `path:${p}`));
  const forkQualifier = includeForks ? 'fork:true' : '';

  const totalCombinations = shards.length * sizeShards.length;
  let currentCombination = 0;

  for (const shard of shards) {
    for (const size of sizeShards) {
      currentCombination++;
      const base = [`filename:${FILENAME}`, shard, `size:${size}`, forkQualifier].filter(Boolean).join(' ');
      console.log(`Searching: ${base} (${currentCombination} of ${totalCombinations})`);
      for (let page = 1; page <= 10; page++) {
        const data = await searchCode(base, page);
        const items = Array.isArray(data.items) ? data.items : [];
        if (items.length === 0) break;

        for (const it of items) {
          const repo = it.repository?.full_name;
          const path: string | undefined = it.path;
          // Enforce requiredPath if provided
          const passesRequired = !requiredPath || (path && path.toLowerCase().includes(requiredPath.replace(/^\//, '')));
          if (repo && passesRequired) {
            repos.add(repo);
          }
        }

        await delay(300);
      }
    }
  }

  const list = Array.from(repos);
  console.log(`Found ${list.length} unique repositories.`);

  // Enrich repositories sequentially
  const enriched: RepositoryData[] = [];
  for (let i = 0; i < list.length; i++) {
    const full = list[i];
    console.log(`Processing ${full} (${i + 1} of ${list.length})`);
    const meta = await fetchRepoMeta(full);
    if (meta) {
      enriched.push({
        full_name: meta.full_name,
        name: meta.name,
        owner: meta.owner.login,
        url: meta.html_url,
        homepage: meta.homepage,
        stars: meta.stargazers_count,
        forks: meta.forks_count,
        created_at: meta.created_at,
        updated_at: meta.updated_at,
        source: 'filename-search',
      });
    }
    // Pace between calls to reduce abuse detection
    await delay(800);
  }

  await processRepositories(enriched);

  await pool.end();
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
