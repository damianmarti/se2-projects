## Scaffold-ETH dependents and discovery scripts

Minimal Node repo to discover and export repositories related to Scaffold-ETH usage.

### What’s included

- `src/scrape-dependents.js` (main script) Puppeteer scraper for GitHub’s “Used by” page. API approach is preferred.
- `src/fetch-dependents-api.ts`: Finds repos referencing your package (e.g., `@scaffold-eth/burner-connector`) by searching manifests/lockfiles, enriches with stars/forks, writes `dependents_api.csv`.
- `src/search-by-filename.ts`: Finds repos containing a specific file name (default `scaffold.config.ts`) across common Next.js paths using path and size sharding, writes `filename_search.csv`.
- `src/fetch-dependents-graphql.ts` (experimental): GraphQL exploration. GitHub’s public GraphQL currently doesn’t expose code search the way we need; prefer the REST scripts above.

### Prerequisites

- Node.js 18 or newer
- A GitHub Personal Access Token with public repo access

### Setup

1. Install deps

```bash
pnpm install
```

2. Create `.env` from the example and set your token

```ini
# .env
GITHUB_TOKEN=ghp_your_token

# fetch-dependents-api.ts
DEP_QUERY_TERMS=@scaffold-eth/burner-connector,burner-connector
INCLUDE_FORKS=false

# search-by-filename.ts
FILENAME=scaffold.config.ts
REQUIRED_PATH=/nextjs/
PATH_SHARDS=/nextjs/,/packages/nextjs/,/apps/nextjs/,/examples/nextjs/,/libs/nextjs/,/modules/nextjs/,/services/nextjs/,/frontend/nextjs/,/front/nextjs/
SIZE_SHARDS=0..4096,4097..16384,16385..65536,>65536
```

### Usage

- Run the Puppeteer scraper (main script):

```bash
pnpm run dev
```

Output: `dependents.csv` with columns: `full_name,name,owner,url,stars,forks`.

- Run dependents (manifest/lockfile search):

```bash
pnpm run dependents:api
```

Output: `dependents_api.csv` with columns: `full_name,name,owner,url,stars,forks`.

- Run filename search (sharded code search):

```bash
pnpm run search:filename
```

Output: `filename_search.csv` with columns: `full_name,name,owner,url,stars,forks`.

### Configuration notes

- `fetch-dependents-api.ts`

  - Uses GitHub REST Search API to find code hits referencing your package in `package.json`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`.
  - Bypasses the 1000-per-query cap by sharding across common repo paths (edit in `src/fetch-dependents-api.ts` under `PATH_SHARDS`).
  - Env: `GITHUB_TOKEN`, `DEP_QUERY_TERMS`, `INCLUDE_FORKS`.

- `search-by-filename.ts`
  - Uses REST code search with path shards and size shards to maximize coverage.
  - Env: `GITHUB_TOKEN`, `FILENAME`, `REQUIRED_PATH`, `PATH_SHARDS`, `SIZE_SHARDS`, `INCLUDE_FORKS`.
  - If you want “everything,” consider setting `REQUIRED_PATH=` (empty) and broadening `PATH_SHARDS`.

### Rate limiting

- Scripts auto‑backoff on 403 using `x-ratelimit-reset`. This may pause for minutes when limits are hit, then resume.
- Enrichment (stars/forks) uses conservative concurrency and pacing to avoid abuse detection.

### Limits and tips

- GitHub code search returns a maximum of 1000 results per query. Sharding by path and file size helps pull more total results by splitting the space.
- Indexing is not instantaneous; some repos may appear/disappear between runs as indexes update.
- Forks: enabling `INCLUDE_FORKS=true` can greatly increase counts.
- For strict ground truth on a known repo list, iterate repos and verify presence of the file via the Git tree API (not included here, but easy to add).

### Troubleshooting

- 422 query parse: simplify the query. Remove qualifiers one by one; avoid invalid combos. We already omit `fork:false` to prevent 422s in code search.
- Few results: broaden `PATH_SHARDS`, clear `REQUIRED_PATH`, or add more `SIZE_SHARDS` buckets.
- Long waits: this is rate limiting—let it finish or try with a fresh token later.

### License

MIT
