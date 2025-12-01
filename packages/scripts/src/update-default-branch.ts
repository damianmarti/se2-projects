/*
  Update default_branch for all repositories in the database.

  For each repository in the database:
  - Fetch repository metadata using fetchRepoMeta from common.ts
  - Extract default_branch from the GitHub API response
  - Update the default_branch column in the database

  Environment variables:
    - POSTGRES_URL: PostgreSQL connection string (required)
    - GITHUB_TOKEN: GitHub Personal Access Token (required)
*/

import dotenv from "dotenv";
import { pool, fetchRepoMeta, delay, setupGracefulShutdown } from "./common";

dotenv.config();

interface RepoRow {
  id: number;
  full_name: string;
  default_branch: string | null;
}

async function updateDefaultBranch(id: number, defaultBranch: string | null): Promise<void> {
  await pool.query("UPDATE repositories SET default_branch = $1 WHERE id = $2", [
    defaultBranch,
    id,
  ]);
}

async function main() {
  setupGracefulShutdown();

  console.log("Loading repositories from database...");
  const { rows } = await pool.query<RepoRow>(
    "SELECT id, full_name, default_branch FROM repositories WHERE deleted_at IS NULL ORDER BY id"
  );

  const total = rows.length;
  console.log(`Updating default_branch for ${total} repositories...`);

  let updated = 0;
  let unchanged = 0;
  let errors = 0;
  let nullFromMeta = 0;

  for (let i = 0; i < rows.length; i++) {
    const repo = rows[i];
    const progress = `[${i + 1}/${total}]`;

    try {
      const meta = await fetchRepoMeta(repo.full_name);

      if (!meta) {
        errors++;
        console.warn(`${progress} Failed to fetch metadata for ${repo.full_name}`);
        await delay(1000);
        continue;
      }

      const defaultBranch = meta.default_branch || null;

      // Count null default_branch from metadata
      if (!meta.default_branch) {
        nullFromMeta++;
      }

      // Only update if the value has changed
      if (repo.default_branch !== defaultBranch) {
        await updateDefaultBranch(repo.id, defaultBranch);
        updated++;
        console.log(
          `${progress} Updated: ${repo.full_name} (default_branch: ${defaultBranch || "null"})`
        );
      } else {
        unchanged++;
        if (i % 50 === 0) {
          console.log(`${progress} Unchanged: ${repo.full_name} (default_branch: ${defaultBranch || "null"})`);
        }
      }

      // Gentle pacing to avoid triggering rate limits
      await delay(150);
    } catch (err) {
      errors++;
      console.error(`${progress} Error processing ${repo.full_name}:`, err);
      await delay(1000);
    }
  }

  console.log("\n=== Default Branch Update Summary ===");
  console.log(`Total: ${total}`);
  console.log(`Updated: ${updated}`);
  console.log(`Unchanged: ${unchanged}`);
  console.log(`Null from metadata: ${nullFromMeta}`);
  console.log(`Errors: ${errors}`);

  await pool.end();
}

main().catch(err => {
  console.error("Unhandled error:", err);
  process.exit(1);
});

