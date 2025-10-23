/*
  GraphQL implementation using GitHub's GraphQL "search" API (type: CODE) to
  find repositories that reference the target package in common manifest and
  lock files, then output CSV with repo metadata. This replaces the previous
  (non-existent) repository.dependents field.
*/

import fs from 'fs';
import dotenv from 'dotenv';
import { graphql } from '@octokit/graphql';

dotenv.config();

const REPO_OWNER = process.env.REPO_OWNER || 'scaffold-eth';
const REPO_NAME = process.env.REPO_NAME || 'burner-connector';
const TOKEN = process.env.GITHUB_TOKEN || process.env.GITHUB_API_KEY;

if (!TOKEN) {
  console.error('GITHUB_TOKEN (or GITHUB_API_KEY) is required in .env');
  process.exit(1);
}

const SEARCH_CODE_QUERY = /* GraphQL */ `
  query SearchCode($q: String!, $cursor: String) {
    search(query: $q, type: CODE, first: 100, after: $cursor) {
      codeCount
      pageInfo { endCursor hasNextPage }
      edges {
        node {
          __typename
          ... on Code {
            repository {
              nameWithOwner
              name
              owner { login }
              url
              stargazerCount
              forkCount
            }
          }
        }
      }
    }
  }
`;

type DepRepo = {
  nameWithOwner: string;
  name: string;
  owner: { login: string };
  url: string;
  stargazerCount: number;
  forkCount: number;
};

const SEARCH_TERMS = [
  '"@scaffold-eth/burner-connector"',
  '"burner-connector"',
];

const FILE_TARGETS = [
  'filename:package.json',
  'filename:package-lock.json',
  'filename:yarn.lock',
  'filename:pnpm-lock.yaml',
];

async function fetchAllDependents(owner: string, name: string) {
  const client = graphql.defaults({
    headers: { authorization: `token ${TOKEN}` },
  });

  const repoMap = new Map<string, DepRepo>();

  console.log(`Searching code references for ${owner}/${name} via GraphQL...`);

  for (const term of SEARCH_TERMS) {
    for (const ft of FILE_TARGETS) {
      const q = `${term} in:file ${ft}`;
      let cursor: string | null = null;
      let page = 1;
      // Paginate up to codeCount or until no next page
      for (;;) {
        const response: any = await client(SEARCH_CODE_QUERY, { q, cursor }).catch((err: any) => {
          console.error('GraphQL error:', err?.message || err);
          throw err;
        });

        const conn = response?.search;
        const edges = Array.isArray(conn?.edges) ? conn.edges : [];
        for (const e of edges) {
          const repo = e?.node?.repository as DepRepo | undefined;
          if (repo?.nameWithOwner) {
            repoMap.set(repo.nameWithOwner, repo);
          }
        }

        const hasNext = Boolean(conn?.pageInfo?.hasNextPage);
        cursor = conn?.pageInfo?.endCursor || null;
        if (!hasNext) break;
        page++;
      }
    }
  }

  return Array.from(repoMap.values());
}

function toCsvValue(val: string | number): string {
  if (typeof val === 'number') return String(val);
  const escaped = (val || '').replace(/"/g, '""');
  return `"${escaped}"`;
}

async function main() {
  try {
    const results = await fetchAllDependents(REPO_OWNER, REPO_NAME);
    const rows = results.map(r => ({
      full_name: r.nameWithOwner,
      name: r.name,
      owner: r.owner.login,
      url: r.url,
      stars: r.stargazerCount,
      forks: r.forkCount,
    }));

    const csv = [
      'full_name,name,owner,url,stars,forks',
      ...rows.map(r => [
        toCsvValue(r.full_name),
        toCsvValue(r.name),
        toCsvValue(r.owner),
        toCsvValue(r.url),
        String(r.stars),
        String(r.forks),
      ].join(',')),
    ].join('\n');

    fs.writeFileSync('dependents_api.csv', csv);
    console.log(`Saved ${rows.length} dependents to dependents_api.csv`);
  } catch (err: any) {
    console.error('Failed to fetch via GraphQL code search:', err?.message || err);
    console.error('If this persists, use the REST search script: pnpm run dependents:api');
    process.exit(1);
  }
}

main();
