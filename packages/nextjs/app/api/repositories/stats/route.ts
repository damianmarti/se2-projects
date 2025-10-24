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
      const totalReposResult = await client.query("SELECT COUNT(*) as count FROM repositories");
      const totalRepos = parseInt(totalReposResult.rows[0].count);

      // Get repositories by source
      const sourceStatsResult = await client.query(`
        SELECT unnest(source) as source, COUNT(*) as count
        FROM repositories
        GROUP BY unnest(source)
        ORDER BY count DESC
      `);
      const sourceStats = sourceStatsResult.rows;

      // Get top repositories by stars
      const topStarsResult = await client.query(`
        SELECT full_name, name, owner, stars, forks, url, source
        FROM repositories
        ORDER BY stars DESC
        LIMIT 10
      `);
      const topStars = topStarsResult.rows;

      // Get repositories added in last 7 days
      const recentReposResult = await client.query(`
        SELECT COUNT(*) as count
        FROM repositories
        WHERE created_at >= NOW() - INTERVAL '7 days'
      `);
      const recentRepos = parseInt(recentReposResult.rows[0].count);

      // Get total stars and forks
      const totalsResult = await client.query(`
        SELECT
          SUM(stars) as total_stars,
          SUM(forks) as total_forks
        FROM repositories
      `);
      const totals = totalsResult.rows[0];

      // Get repositories by owner (top 10)
      const topOwnersResult = await client.query(`
        SELECT owner, COUNT(*) as repo_count, SUM(stars) as total_stars
        FROM repositories
        GROUP BY owner
        ORDER BY repo_count DESC
        LIMIT 10
      `);
      const topOwners = topOwnersResult.rows;

      return NextResponse.json({
        totalRepos,
        sourceStats,
        topStars,
        recentRepos,
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
