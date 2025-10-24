/*
  Common utilities for repository data collection scripts.

  This file contains shared functions for database operations and GitHub API interactions
  that are used across multiple scripts.
*/

import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config();

// Database configuration
const postgresUrl = process.env.POSTGRES_URL;
if (!postgresUrl) {
  console.error("POSTGRES_URL is required. Set it in your environment.");
  process.exit(1);
}

export const pool = new Pool({
  connectionString: postgresUrl,
});

// GitHub API configuration
const githubToken = process.env.GITHUB_TOKEN;
if (!githubToken) {
  console.error("GITHUB_TOKEN is required. Set it in your environment.");
  process.exit(1);
}

export const githubHeaders: Record<string, string> = {
  Authorization: `token ${githubToken}`,
  Accept: "application/vnd.github.v3+json",
  "User-Agent": "scaffold-eth-dependents-scripts",
};

// Common types
export interface RepositoryData {
  full_name: string;
  name: string;
  owner: string;
  url: string;
  homepage?: string;
  stars: number;
  forks: number;
  created_at: string;
  updated_at: string;
  source: string[];
}

export interface GitHubRepoResponse {
  full_name: string;
  name: string;
  owner: { login: string };
  html_url: string;
  homepage?: string;
  stargazers_count: number;
  forks_count: number;
  fork: boolean;
  created_at: string;
  updated_at: string;
}

// Utility functions
export async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Database functions
export async function upsertRepository(repo: RepositoryData): Promise<void> {
  const query = `
    INSERT INTO repositories (full_name, name, owner, url, homepage, stars, forks, created_at, updated_at, source, last_seen)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
    ON CONFLICT (full_name)
    DO UPDATE SET
      stars = EXCLUDED.stars,
      forks = EXCLUDED.forks,
      updated_at = EXCLUDED.updated_at,
      homepage = EXCLUDED.homepage,
      source = ARRAY(SELECT DISTINCT unnest(repositories.source || EXCLUDED.source)),
      last_seen = NOW()
  `;

  const values = [
    repo.full_name,
    repo.name,
    repo.owner,
    repo.url,
    repo.homepage || null,
    repo.stars,
    repo.forks,
    repo.created_at,
    repo.updated_at,
    repo.source,
  ];

  await pool.query(query, values);
}

// GitHub API functions
export async function fetchRepoMeta(
  fullName: string
): Promise<GitHubRepoResponse | null> {
  const url = `https://api.github.com/repos/${fullName}`;
  const res = await fetch(url, { headers: githubHeaders });

  if (res.status === 403) {
    // Rate limit - back off
    const reset = res.headers.get("x-ratelimit-reset");
    const nowSec = Math.floor(Date.now() / 1000);
    const waitMs = reset ? (parseInt(reset, 10) - nowSec + 2) * 1000 : 30_000;
    console.warn(
      `Rate limited on repo meta (${fullName}). Waiting ${Math.max(
        waitMs,
        5000
      )}ms...`
    );
    await delay(Math.max(waitMs, 5000));
    return fetchRepoMeta(fullName);
  }

  if (!res.ok) {
    console.warn(`Failed to fetch repo meta for ${fullName}: ${res.status}`);
    return null;
  }

  return res.json();
}

// Helper function to process repositories and save to database
export async function processRepositories(
  repositories: RepositoryData[]
): Promise<{ savedCount: number; updatedCount: number }> {
  console.log(`Saving ${repositories.length} repositories to database...`);

  let savedCount = 0;
  let updatedCount = 0;

  for (let i = 0; i < repositories.length; i++) {
    const repo = repositories[i];
    const progress = `[${i + 1}/${repositories.length}]`;

    try {
      // Check if repository already exists
      const existingRepo = await pool.query(
        "SELECT full_name FROM repositories WHERE full_name = $1",
        [repo.full_name]
      );

      await upsertRepository(repo);

      if (existingRepo.rows.length > 0) {
        updatedCount++;
      } else {
        savedCount++;
      }

      console.log(
        `${progress} Processed: ${repo.full_name} (${
          existingRepo.rows.length > 0 ? "updated" : "saved"
        })`
      );
    } catch (error) {
      console.error(
        `${progress} Error saving repository ${repo.full_name}:`,
        error
      );
    }
  }

  console.log(
    `Database operation completed: ${savedCount} new repositories saved, ${updatedCount} repositories updated`
  );

  return { savedCount, updatedCount };
}

// Graceful shutdown handler
export function setupGracefulShutdown(): void {
  process.on("SIGINT", async () => {
    console.log("\nReceived SIGINT, shutting down gracefully...");
    await pool.end();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    console.log("\nReceived SIGTERM, shutting down gracefully...");
    await pool.end();
    process.exit(0);
  });
}
