import { NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
});

export async function GET() {
  try {
    const client = await pool.connect();

    try {
      // Get total repositories count
      const totalReposResult = await client.query(
        "SELECT COUNT(*) as count FROM repositories WHERE deleted_at IS NULL",
      );
      const totalRepos = parseInt(totalReposResult.rows[0].count);

      // Get deleted repositories count
      const deletedReposResult = await client.query(
        "SELECT COUNT(*) as count FROM repositories WHERE deleted_at IS NOT NULL",
      );
      const deletedRepos = parseInt(deletedReposResult.rows[0].count);

      // Get repositories by source
      const sourceStatsResult = await client.query(`
        SELECT unnest(source) as source, COUNT(*) as count
        FROM repositories
        WHERE deleted_at IS NULL
        GROUP BY unnest(source)
        ORDER BY count DESC
      `);
      const sourceStats = sourceStatsResult.rows;

      // Get top repositories by stars
      const topStarsResult = await client.query(`
        SELECT full_name, name, owner, stars, forks, url, source
        FROM repositories
        WHERE deleted_at IS NULL
        ORDER BY stars DESC
        LIMIT 10
      `);
      const topStars = topStarsResult.rows;

      // Get repositories added in last 7 days
      const recentReposResult = await client.query(`
        SELECT COUNT(*) as count
        FROM repositories
        WHERE deleted_at IS NULL AND created_at >= NOW() - INTERVAL '7 days'
      `);
      const recentRepos = parseInt(recentReposResult.rows[0].count);

      // Get repositories saved in last 7 days
      const recentSavedReposResult = await client.query(`
        SELECT COUNT(*) as count
        FROM repositories
        WHERE deleted_at IS NULL AND saved_at >= NOW() - INTERVAL '7 days'
      `);
      const recentSavedRepos = parseInt(recentSavedReposResult.rows[0].count);

      // Get daily saved counts for last 30 days
      const savedByDateResult = await client.query(`
        SELECT saved_at::date as date, COUNT(*) as count
        FROM repositories
        WHERE saved_at >= NOW() - INTERVAL '30 days'
        GROUP BY saved_at::date
        ORDER BY saved_at::date DESC
      `);
      const savedByDate = savedByDateResult.rows.map(row => ({
        date: row.date,
        count: parseInt(row.count),
      }));

      // Get total stars and forks
      const totalsResult = await client.query(`
        SELECT
          SUM(stars) as total_stars,
          SUM(forks) as total_forks
        FROM repositories
        WHERE deleted_at IS NULL
      `);
      const totals = totalsResult.rows[0];

      // Get repositories by owner (top 10)
      const topOwnersResult = await client.query(`
        SELECT owner, COUNT(*) as repo_count, SUM(stars) as total_stars
        FROM repositories
        WHERE deleted_at IS NULL
        GROUP BY owner
        ORDER BY repo_count DESC
        LIMIT 10
      `);
      const topOwners = topOwnersResult.rows;

      return NextResponse.json({
        totalRepos,
        deletedRepos,
        sourceStats,
        topStars,
        recentRepos,
        recentSavedRepos,
        savedByDate,
        totals: {
          totalStars: parseInt(totals.total_stars) || 0,
          totalForks: parseInt(totals.total_forks) || 0,
        },
        topOwners,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Database error:", error);
    return NextResponse.json({ error: "Failed to fetch repository statistics" }, { status: 500 });
  }
}
