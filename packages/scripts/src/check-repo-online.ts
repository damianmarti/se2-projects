/*
  Check if repositories are online and update deleted_at accordingly.

  For each repository in the database:
  - Perform an HTTP HEAD request to the repository url
  - If status is 404 and deleted_at IS NULL => set deleted_at = NOW()
  - If status is 2xx/3xx and deleted_at IS NOT NULL => set deleted_at = NULL
  - If status is 2xx/3xx, check if scaffold.config.ts exists in the repository
  - If scaffold.config.ts is not found and truncated is false and deleted_at IS NULL => set deleted_at = NOW()
  - Handle 429 responses with backoff and retry

  Environment variables:
    - POSTGRES_URL: PostgreSQL connection string (required)
    - GITHUB_TOKEN: GitHub Personal Access Token (required)
*/

import dotenv from "dotenv";
import { pool, delay, setupGracefulShutdown, githubHeaders } from "./common";

dotenv.config();

interface RepoRow {
  id: number;
  full_name: string;
  url: string;
  deleted_at: string | null;
  default_branch: string | null;
}

interface GitTreeResponse {
  sha: string;
  url: string;
  tree: Array<{
    path: string;
    mode: string;
    type: string;
    size?: number;
    sha: string;
    url: string;
  }>;
  truncated: boolean;
}

async function headWithRetry(url: string, maxRetries = 5): Promise<Response> {
  let attempt = 0;
  // Some servers reject HEAD; we fallback to GET if HEAD returns 405
  while (attempt < maxRetries) {
    attempt++;
    try {
      let res = await fetch(url, { method: "HEAD" });

      if (res.status === 405) {
        // Method Not Allowed - try GET
        res = await fetch(url, { method: "GET" });
      }

      if (res.status === 429) {
        const retryAfter = res.headers.get("retry-after");
        const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 30_000;
        console.warn(`429 received for ${url}. Waiting ${waitMs}ms before retry (${attempt}/${maxRetries})...`);
        await delay(waitMs);
        continue;
      }

      // Any other status: return
      return res;
    } catch (err) {
      const waitMs = 5_000 * attempt;
      console.warn(`Request error for ${url} (attempt ${attempt}/${maxRetries}): ${String(err)}. Waiting ${waitMs}ms...`);
      await delay(waitMs);
    }
  }

  // Final fallback: try GET once more
  return fetch(url, { method: "GET" });
}

async function fetchGitTreeWithRetry(
  fullName: string,
  defaultBranch: string,
  maxRetries = 5
): Promise<GitTreeResponse | null> {
  let attempt = 0;
  const url = `https://api.github.com/repos/${fullName}/git/trees/${defaultBranch}?recursive=1`;

  while (attempt < maxRetries) {
    attempt++;
    try {
      const res = await fetch(url, { headers: githubHeaders });

      if (res.status === 403) {
        // Rate limit - back off
        const reset = res.headers.get("x-ratelimit-reset");
        const nowSec = Math.floor(Date.now() / 1000);
        const waitMs = reset ? (parseInt(reset, 10) - nowSec + 2) * 1000 : 30_000;
        console.warn(
          `Rate limited on git tree (${fullName}). Waiting ${Math.max(waitMs, 5000)}ms...`
        );
        await delay(Math.max(waitMs, 5000));
        continue;
      }

      if (res.status === 429) {
        const retryAfter = res.headers.get("retry-after");
        const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 30_000;
        console.warn(
          `429 received for git tree (${fullName}). Waiting ${waitMs}ms before retry (${attempt}/${maxRetries})...`
        );
        await delay(waitMs);
        continue;
      }

      if (!res.ok) {
        console.warn(`Failed to fetch git tree for ${fullName}: ${res.status}`);
        return null;
      }

      return res.json();
    } catch (err) {
      const waitMs = 5_000 * attempt;
      console.warn(
        `Request error for git tree (${fullName}) (attempt ${attempt}/${maxRetries}): ${String(err)}. Waiting ${waitMs}ms...`
      );
      await delay(waitMs);
    }
  }

  return null;
}

function hasScaffoldConfig(tree: GitTreeResponse): boolean {
  return tree.tree.some((item) => item.path.endsWith("scaffold.config.ts") && item.type === "blob");
}

async function updateDeletedAt(id: number, value: "now" | null): Promise<void> {
  if (value === "now") {
    await pool.query("UPDATE repositories SET deleted_at = NOW() WHERE id = $1", [id]);
  } else {
    await pool.query("UPDATE repositories SET deleted_at = NULL WHERE id = $1", [id]);
  }
}

async function main() {
  setupGracefulShutdown();

  console.log("Loading repositories from database...");
  const { rows } = await pool.query<RepoRow>(
    "SELECT id, full_name, url, deleted_at, default_branch FROM repositories ORDER BY id"
  );

  const total = rows.length;
  console.log(`Checking ${total} repositories...`);

  let markedDeleted = 0;
  let restored = 0;
  let unchanged = 0;
  let errors = 0;
  let deletedNoScaffoldConfig = 0;

  for (let i = 0; i < rows.length; i++) {
    const repo = rows[i];
    const progress = `[${i + 1}/${total}]`;

    try {
      const res = await headWithRetry(repo.url);
      const status = res.status;

      const isOnline = status >= 200 && status < 400; // treat 2xx/3xx as online
      const isNotFound = status === 404;

      if (isNotFound && repo.deleted_at === null) {
        await updateDeletedAt(repo.id, "now");
        markedDeleted++;
        console.log(`${progress} Marked deleted: ${repo.full_name} (status ${status})`);
      } else if (isOnline) {
        // Repository is online - check if it still uses Scaffold-ETH 2
        if (repo.deleted_at !== null) {
          // Repository was previously marked as deleted but is now online
          await updateDeletedAt(repo.id, null);
          restored++;
          console.log(`${progress} Restored: ${repo.full_name} (status ${status})`);
        } else {
          // Check if scaffold.config.ts exists
          // Use "main" as fallback if default_branch is null
          const branch = repo.default_branch || "main";
          const tree = await fetchGitTreeWithRetry(repo.full_name, branch);

          if (tree === null) {
            // Failed to fetch tree - skip for now
            unchanged++;
            if (i % 50 === 0) {
              console.log(`${progress} Unchanged: ${repo.full_name} (status ${status}, tree fetch failed)`);
            }
          } else if (!tree.truncated && !hasScaffoldConfig(tree)) {
            // scaffold.config.ts not found and tree is not truncated
            await updateDeletedAt(repo.id, "now");
            markedDeleted++;
            deletedNoScaffoldConfig++;
            console.log(
              `${progress} Marked deleted (no scaffold.config.ts): ${repo.full_name} (status ${status})`
            );
          } else {
            unchanged++;
            if (i % 50 === 0) {
              console.log(`${progress} Unchanged: ${repo.full_name} (status ${status})`);
            }
          }

          // Additional delay after git tree API call
          await delay(150);
        }
      } else {
        unchanged++;
        if (i % 50 === 0) {
          console.log(`${progress} Unchanged: ${repo.full_name} (status ${status})`);
        }
      }

      // Gentle pacing to avoid triggering rate limits on GitHub/CDN
      await delay(200);
    } catch (err) {
      errors++;
      console.error(`${progress} Error checking ${repo.full_name}:`, err);
      await delay(1000);
    }
  }

  console.log("\n=== Online Check Summary ===");
  console.log(`Total: ${total}`);
  console.log(`Marked deleted: ${markedDeleted}`);
  console.log(`  - Deleted (no scaffold.config.ts): ${deletedNoScaffoldConfig}`);
  console.log(`Restored: ${restored}`);
  console.log(`Unchanged: ${unchanged}`);
  console.log(`Errors: ${errors}`);

  await pool.end();
}

main().catch(err => {
  console.error("Unhandled error:", err);
  process.exit(1);
});


