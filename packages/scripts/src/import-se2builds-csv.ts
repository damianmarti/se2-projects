/*
  Import repositories from se2builds-export.csv file.

  Reads the CSV file and for each repository:
  - Checks if the URL already exists in the database
  - If not, fetches repository metadata using GitHub API
  - Saves the repository with the data-origin value as the source

  Environment variables:
    - GITHUB_TOKEN: GitHub Personal Access Token (required)
    - POSTGRES_URL: PostgreSQL connection string (required)
*/

import * as fs from "fs";
import * as path from "path";
import csv = require("csv-parser");
import dotenv from "dotenv";
import {
  pool,
  delay,
  fetchRepoMeta,
  upsertRepository,
  setupGracefulShutdown,
  type RepositoryData,
} from "./common";

dotenv.config();

// Resolve CSV file path - try multiple possible locations
const getCSVPath = (): string => {
  const possiblePaths = [
    path.join(process.cwd(), "packages/scripts/data/se2builds-export.csv"), // From root
    path.join(process.cwd(), "data/se2builds-export.csv"), // From packages/scripts
    path.resolve(__dirname || ".", "../data/se2builds-export.csv"), // Relative to script
  ];

  for (const csvPath of possiblePaths) {
    if (fs.existsSync(csvPath)) {
      return csvPath;
    }
  }

  // Default to the most common location
  return path.join(process.cwd(), "packages/scripts/data/se2builds-export.csv");
};

const CSV_FILE_PATH = getCSVPath();

interface CSVRow {
  full_name: string;
  name: string;
  owner: string;
  url: string;
  stars: string;
  forks: string;
  "data-origin": string;
}

async function parseCSV(filePath: string): Promise<CSVRow[]> {
  return new Promise((resolve, reject) => {
    const rows: CSVRow[] = [];

    fs.createReadStream(filePath)
      .pipe(
        csv({
          separator: ";", // CSV uses semicolon as delimiter
        })
      )
      .on("data", (row: CSVRow) => {
        rows.push(row);
      })
      .on("end", () => {
        resolve(rows);
      })
      .on("error", (error: Error) => {
        // Log error but continue processing (skip malformed lines)
        console.warn(`CSV parsing error: ${error.message}`);
        reject(error);
      });
  });
}

async function urlExists(url: string): Promise<boolean> {
  const result = await pool.query("SELECT id FROM repositories WHERE url = $1", [url]);
  return result.rows.length > 0;
}

async function main() {
  setupGracefulShutdown();

  console.log(`Reading CSV file: ${CSV_FILE_PATH}`);

  if (!fs.existsSync(CSV_FILE_PATH)) {
    console.error(`CSV file not found: ${CSV_FILE_PATH}`);
    process.exit(1);
  }

  const rows = await parseCSV(CSV_FILE_PATH);

  console.log(`Found ${rows.length} rows in CSV file`);

  let processedCount = 0;
  let skippedCount = 0;
  let savedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const progress = `[${i + 1}/${rows.length}]`;

    processedCount++;
    try {
      // Check if URL already exists
      const exists = await urlExists(row.url);
      if (exists) {
        console.log(`${progress} Skipping ${row.url} (already exists)`);
        skippedCount++;
        continue;
      }

      console.log(`${progress} Processing ${row.full_name}...`);

      // Fetch repository metadata
      const meta = await fetchRepoMeta(row.full_name);
      if (!meta) {
        console.warn(`${progress} Failed to fetch metadata for ${row.full_name}`);
        errorCount++;
        await delay(800); // Still delay to respect rate limits
        continue;
      }

      // Prepare repository data
      const repoData: RepositoryData = {
        full_name: meta.full_name,
        name: meta.name,
        owner: meta.owner.login,
        url: meta.html_url,
        homepage: meta.homepage,
        stars: meta.stargazers_count,
        forks: meta.forks_count,
        created_at: meta.created_at,
        updated_at: meta.updated_at,
        source: [row["data-origin"]],
      };

      // Save to database
      await upsertRepository(repoData);
      savedCount++;
      console.log(`${progress} Saved ${repoData.full_name} with source: ${row["data-origin"]}`);

      // Rate limiting delay
      await delay(800);
    } catch (error) {
      console.error(`${progress} Error processing ${row.full_name}:`, error);
      errorCount++;
      await delay(800);
    }
  }

  console.log("\n=== Import Summary ===");
  console.log(`Total rows processed: ${processedCount}`);
  console.log(`Already existed (skipped): ${skippedCount}`);
  console.log(`New repositories saved: ${savedCount}`);
  console.log(`Errors: ${errorCount}`);

  await pool.end();
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});

