/*
  Check if repositories are online and update deleted_at accordingly.

  For each repository in the database:
  - Perform an HTTP HEAD request to the repository url
  - If status is 404 and deleted_at IS NULL => set deleted_at = NOW()
  - If status is 2xx/3xx and deleted_at IS NOT NULL => set deleted_at = NULL
  - Handle 429 responses with backoff and retry

  Environment variables:
    - POSTGRES_URL: PostgreSQL connection string (required)
*/

import dotenv from "dotenv";
import { pool, delay, setupGracefulShutdown } from "./common";

dotenv.config();

interface RepoRow {
  id: number;
  full_name: string;
  url: string;
  deleted_at: string | null;
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
    "SELECT id, full_name, url, deleted_at FROM repositories ORDER BY id"
  );

  const total = rows.length;
  console.log(`Checking ${total} repositories...`);

  let markedDeleted = 0;
  let restored = 0;
  let unchanged = 0;
  let errors = 0;

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
      } else if (isOnline && repo.deleted_at !== null) {
        await updateDeletedAt(repo.id, null);
        restored++;
        console.log(`${progress} Restored: ${repo.full_name} (status ${status})`);
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
  console.log(`Restored: ${restored}`);
  console.log(`Unchanged: ${unchanged}`);
  console.log(`Errors: ${errors}`);

  await pool.end();
}

main().catch(err => {
  console.error("Unhandled error:", err);
  process.exit(1);
});


