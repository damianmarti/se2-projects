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

import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error('GITHUB_TOKEN is required. Set it in your .env');
  process.exit(1);
}

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

const headers: Record<string, string> = {
  Authorization: `token ${token}`,
  Accept: 'application/vnd.github.v3+json',
  'User-Agent': 'filename-search-script',
};

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let globalResumeAtMs = 0;
async function ensureGlobalResumeWindow(): Promise<void> {
  const now = Date.now();
  if (now < globalResumeAtMs) {
    const waitMs = globalResumeAtMs - now;
    console.warn(`Global backoff active. Waiting ${waitMs}ms...`);
    await delay(waitMs);
  }
}

async function searchCode(q: string, page: number): Promise<any> {
  const url = `https://api.github.com/search/code?q=${encodeURIComponent(q)}&per_page=100&page=${page}`;
  const res = await fetch(url, { headers });
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

async function fetchRepo(fullName: string): Promise<any | null> {
  await ensureGlobalResumeWindow();
  const url = `https://api.github.com/repos/${fullName}`;
  const res = await fetch(url, { headers });
  if (res.status === 403) {
    const reset = res.headers.get('x-ratelimit-reset');
    const nowSec = Math.floor(Date.now() / 1000);
    const waitMs = Math.max(reset ? (parseInt(reset, 10) - nowSec + 2) * 1000 : 30_000, 5000);
    globalResumeAtMs = Date.now() + waitMs;
    console.warn(`Rate limited on repo ${fullName}. Global wait ${waitMs}ms until reset...`);
    await ensureGlobalResumeWindow();
    const retry = await fetch(url, { headers });
    if (!retry.ok) return null;
    return retry.json();
  }
  if (!res.ok) return null;
  return res.json();
}

function toCsvValue(val: string | number): string {
  if (typeof val === 'number') return String(val);
  const escaped = (val || '').replace(/"/g, '""');
  return `"${escaped}"`;
}

async function main() {
  console.log(`Searching for filename:${FILENAME} across path and size shards...`);
  const repos = new Set<string>();

  // Always run a generic filename search (no path) as well
  const shards = [''].concat(pathShards.map(p => `path:${p}`));
  const forkQualifier = includeForks ? 'fork:true' : '';

  for (const shard of shards) {
    for (const size of sizeShards) {
      const base = [`filename:${FILENAME}`, shard, `size:${size}`, forkQualifier].filter(Boolean).join(' ');
      console.log(`Searching: ${base}`);
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

  // Enrich with conservative concurrency and pacing
  const concurrency = 3;
  const queue: Array<Promise<any>> = [];
  const enriched: any[] = new Array(list.length);
  let nextIndex = 0;
  async function worker(workerId: number) {
    while (true) {
      const idx = nextIndex++;
      if (idx >= list.length) break;
      const full = list[idx];
      const meta = await fetchRepo(full);
      if (meta) {
        enriched[idx] = {
          full_name: meta.full_name,
          name: meta.name,
          owner: meta.owner?.login,
          url: meta.html_url,
          stars: meta.stargazers_count,
          forks: meta.forks_count,
        };
      }
      // Pace between calls to reduce abuse detection
      await delay(800);
    }
  }
  for (let i = 0; i < concurrency; i++) queue.push(worker(i));
  await Promise.all(queue);

  const filtered = enriched.filter(Boolean);
  const csv = [
    'full_name,name,owner,url,stars,forks',
    ...filtered.map(r => [
      toCsvValue(r.full_name),
      toCsvValue(r.name),
      toCsvValue(r.owner),
      toCsvValue(r.url),
      String(r.stars),
      String(r.forks),
    ].join(',')),
  ].join('\n');

  const out = 'filename_search.csv';
  fs.writeFileSync(out, csv);
  console.log(`Saved ${filtered.length} repositories to ${out}`);
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
