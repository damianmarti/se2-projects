# Scaffold-ETH Repository Discovery Scripts

A comprehensive Node.js toolkit for discovering and analyzing repositories that use Scaffold-ETH. The scripts collect repository data from multiple sources and store it in a PostgreSQL database for analysis and visualization.

## What's Included

- **`src/fetch-dependents-api.ts`**: Finds repositories referencing Scaffold-ETH packages by searching manifests/lockfiles via GitHub API
- **`src/search-by-filename.ts`**: Discovers repositories containing specific files (e.g., `scaffold.config.ts`) using sharded code search
- **`src/scrape-dependents.ts`**: Scrapes GitHub's "Used by" page using Puppeteer for comprehensive coverage
- **`src/common.ts`**: Shared utilities for database operations and GitHub API interactions
- **`src/fetch-dependents-graphql.ts`**: Experimental GraphQL approach (limited by GitHub's public API)

## Prerequisites

- Node.js 18 or newer
- PostgreSQL database
- GitHub Personal Access Token with public repo access

## Database Setup

1. **Install dependencies:**
   ```bash
   yarn install
   ```

2. **Set up PostgreSQL database:**
   ```bash
   # Connect to your PostgreSQL instance
   psql -U postgres -d repositories

   # Run the SQL script to create the table
   \i database/repositories.sql
   ```

3. **Create `.env` file:**
   ```env
   # GitHub API Configuration
   GITHUB_TOKEN=your_github_token_here

   # Database Configuration
   POSTGRES_URL=postgresql://username:password@localhost:5432/repositories

   # Optional: Search Configuration
   DEP_QUERY_TERMS=@scaffold-eth/burner-connector,burner-connector
   INCLUDE_FORKS=false
   FILENAME=scaffold.config.ts
   REQUIRED_PATH=/nextjs/
   PATH_SHARDS=/nextjs/,/packages/nextjs/,/apps/nextjs/,/examples/nextjs/,/libs/nextjs/,/modules/nextjs/,/services/nextjs/
   SIZE_SHARDS=0..4096,4097..16384,16385..65536,>65536
   ```

## Database Schema

The `repositories` table structure:

| Field | Type | Description |
|-------|------|-------------|
| `id` | SERIAL PRIMARY KEY | Auto-incrementing primary key |
| `full_name` | VARCHAR(255) UNIQUE | Repository full name (unique identifier) |
| `name` | VARCHAR(255) | Repository name |
| `owner` | VARCHAR(255) | Repository owner/organization |
| `url` | TEXT | GitHub repository URL |
| `homepage` | VARCHAR(255) | Repository homepage URL |
| `stars` | INTEGER | Number of stars |
| `forks` | INTEGER | Number of forks |
| `created_at` | TIMESTAMP WITH TIME ZONE | Repository creation date from GitHub |
| `updated_at` | TIMESTAMP WITH TIME ZONE | Repository last update date from GitHub |
| `last_seen` | TIMESTAMP WITH TIME ZONE | When this repository was last checked |
| `saved_at` | TIMESTAMP DEFAULT | When this record was saved to database |
| `source` | VARCHAR(255) | Source of the repository data |

## Usage

### Data Collection Scripts

```bash
# Fetch repositories via GitHub API (dependency analysis)
yarn dependents-api

# Search repositories by filename
yarn search-filename

# Scrape repositories via Puppeteer (GitHub dependents page)
yarn scrape
```

### Data Sources

The scripts collect data from multiple sources with different strengths:

- **`dependents-api`**: GitHub API dependency analysis - finds repos using Scaffold-ETH packages
- **`filename-search`**: Code search by filename - discovers repos with Scaffold-ETH config files
- **`scrape-dependents`**: Web scraping - comprehensive coverage of GitHub's dependents page

### Upsert Behavior

- **New repositories**: Inserted with all metadata
- **Existing repositories**: Updated with latest stars, forks, updated_at, source, and last_seen

## Script Details

### `fetch-dependents-api.ts`
- Uses GitHub REST Search API to find code references in package files
- Bypasses 1000-per-query limit through path sharding
- Environment: `GITHUB_TOKEN`, `DEP_QUERY_TERMS`, `INCLUDE_FORKS`

### `search-by-filename.ts`
- Uses REST code search with path and size sharding for maximum coverage
- Environment: `GITHUB_TOKEN`, `FILENAME`, `REQUIRED_PATH`, `PATH_SHARDS`, `SIZE_SHARDS`, `INCLUDE_FORKS`

### `scrape-dependents.ts`
- Puppeteer-based scraper for GitHub's dependents page
- Handles pagination and rate limiting automatically
- Provides comprehensive coverage beyond API limitations

## Rate Limiting & Performance

- **Auto-backoff**: Scripts automatically handle 403 rate limits using `x-ratelimit-reset`
- **Progress indicators**: All scripts show `[current/total]` progress during processing
- **Graceful shutdown**: Handles SIGINT/SIGTERM signals for clean resource cleanup
- **Conservative pacing**: Uses delays between API calls to avoid abuse detection

## Configuration Tips

### Maximizing Results
- **Broaden search**: Set `REQUIRED_PATH=` (empty) and expand `PATH_SHARDS`
- **Include forks**: Enable `INCLUDE_FORKS=true` for higher counts
- **Multiple sources**: Run all three collection scripts for comprehensive coverage

### Performance Optimization
- **Database indexes**: Pre-created for common query patterns (owner, stars, forks, dates)
- **Batch processing**: Scripts process repositories in batches with progress tracking
- **Error handling**: Individual repository failures don't stop the entire process

## Troubleshooting

### Common Issues
- **422 query parse**: Simplify queries by removing qualifiers one by one
- **Few results**: Broaden `PATH_SHARDS`, clear `REQUIRED_PATH`, or add more `SIZE_SHARDS`
- **Long waits**: This is rate limiting - let it finish or try with a fresh token
- **Database connection**: Verify `POSTGRES_URL` format and database accessibility

### Debugging
- **Progress tracking**: All scripts show detailed progress indicators
- **Error logging**: Individual repository errors are logged without stopping execution
- **Graceful shutdown**: Use Ctrl+C to cleanly stop running scripts

## License

MIT
