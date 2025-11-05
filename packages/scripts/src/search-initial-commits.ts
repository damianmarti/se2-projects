/*
  Search GitHub commits for "Initial commit with 🏗️ Scaffold-ETH 2" and save repository data to database.

  Uses GitHub's Search API for commits to find repositories that started with Scaffold-ETH 2.
  Fetches full repository metadata and saves to the database with source "initial-commit".

  Environment variables:
    - GITHUB_TOKEN: GitHub Personal Access Token (required)
    - POSTGRES_URL: PostgreSQL connection string (required)
*/

import dotenv from "dotenv";
import {
  pool,
  githubHeaders,
  delay,
  fetchRepoMeta,
  processRepositories,
  setupGracefulShutdown,
  type RepositoryData,
} from "./common";

dotenv.config();

interface CommitSearchResponse {
  total_count: number;
  items: Array<{
    repository: {
      html_url: string;
      full_name?: string;
    };
  }>;
}

function extractFullNameFromUrl(url: string): string | null {
  // Extract full_name from URL like https://github.com/owner/repo
  const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (match) {
    return `${match[1]}/${match[2]}`;
  }
  return null;
}

async function searchCommits(page: number): Promise<CommitSearchResponse> {
  const query = "Initial commit with 🏗️ Scaffold-ETH 2";
  const url = `https://api.github.com/search/commits?q=${encodeURIComponent(
    query
  )}&sort=committer-date&order=desc&per_page=100&page=${page}`;

  const res = await fetch(url, { headers: githubHeaders });

  if (res.status === 403) {
    // Rate limit - back off
    const reset = res.headers.get("x-ratelimit-reset");
    const nowSec = Math.floor(Date.now() / 1000);
    const waitMs = reset ? (parseInt(reset, 10) - nowSec + 2) * 1000 : 30_000;
    console.warn(
      `Rate limited on commit search. Waiting ${Math.max(waitMs, 5000)}ms...`
    );
    await delay(Math.max(waitMs, 5000));
    return searchCommits(page);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API error ${res.status}: ${text}`);
  }

  return res.json();
}

async function main() {
  setupGracefulShutdown();

  console.log("Searching for commits with 'Initial commit with 🏗️ Scaffold-ETH 2'...");

  const repositoryFullNames = new Set<string>();
  let totalCount = 0;
  let currentPage = 1;

  // Get first page to determine total count
  console.log(`Fetching page ${currentPage}...`);
  const firstResponse = await searchCommits(currentPage);
  totalCount = firstResponse.total_count;
  console.log(`Total commits found: ${totalCount}`);

  // Extract full_names from first page
  firstResponse.items.forEach((item) => {
    const fullName = item.repository.full_name || extractFullNameFromUrl(item.repository.html_url);
    if (fullName) {
      repositoryFullNames.add(fullName);
    }
  });

  console.log(`Progress: ${repositoryFullNames.size} unique repositories found so far...`);

  // Calculate total pages (100 per page), but limit to 10 pages (GitHub API limitation)
  const maxPages = 10;
  const totalPages = Math.min(Math.ceil(totalCount / 100), maxPages);
  console.log(`Will fetch ${totalPages} pages total (limited to first ${maxPages} pages by GitHub API)`);

  // Fetch remaining pages
  for (currentPage = 2; currentPage <= totalPages; currentPage++) {
    console.log(`Fetching page ${currentPage}/${totalPages}...`);

    const response = await searchCommits(currentPage);

    response.items.forEach((item) => {
      const fullName = item.repository.full_name || extractFullNameFromUrl(item.repository.html_url);
      if (fullName) {
        repositoryFullNames.add(fullName);
      }
    });

    const progress = ((currentPage / totalPages) * 100).toFixed(1);
    console.log(
      `Progress: ${currentPage}/${totalPages} pages (${progress}%) - ${repositoryFullNames.size} unique repositories found`
    );

    // Rate limiting delay
    await delay(800);
  }

  // Convert to array and sort
  const fullNames = Array.from(repositoryFullNames).sort();
  console.log(`\nFound ${fullNames.length} unique repositories. Fetching metadata...`);

  // Fetch metadata for all repositories
  const enriched: RepositoryData[] = [];
  for (let i = 0; i < fullNames.length; i++) {
    const fullName = fullNames[i];
    console.log(`Processing ${fullName} (${i + 1} of ${fullNames.length})`);
    const meta = await fetchRepoMeta(fullName);
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
        source: ["initial-commit"],
      });
    }
    // Pace between calls to reduce abuse detection
    await delay(800);
  }

  // Save to database using processRepositories
  const { savedCount, updatedCount } = await processRepositories(enriched);

  console.log("\n=== Search Summary ===");
  console.log(`Total commits found: ${totalCount}`);
  console.log(`Pages fetched: ${totalPages} (max 10 pages due to GitHub API limitation)`);
  console.log(`Unique repositories found: ${fullNames.length}`);
  console.log(`Repositories with metadata: ${enriched.length}`);
  console.log(`New repositories saved: ${savedCount}`);
  console.log(`Existing repositories updated: ${updatedCount}`);
  if (totalCount > 1000) {
    console.log(`Note: Only first 1000 results accessible (${totalPages} pages)`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});

