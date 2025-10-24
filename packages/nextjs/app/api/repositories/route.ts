import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "30");
    const sortBy = searchParams.get("sortBy") || "id";
    const sortOrder = searchParams.get("sortOrder") || "desc";
    const search = searchParams.get("search") || "";

    const offset = (page - 1) * limit;

    // Validate sortBy parameter
    const allowedSortFields = ["id", "stars", "forks", "name", "owner", "created_at", "updated_at", "last_seen"];
    const validSortBy = allowedSortFields.includes(sortBy) ? sortBy : "id";
    const validSortOrder = sortOrder.toLowerCase() === "asc" ? "ASC" : "DESC";

    const client = await pool.connect();

    try {
      // Build the WHERE clause for search
      let whereClause = "";
      const queryParams: any[] = [];

      if (search) {
        whereClause = "WHERE (full_name ILIKE $1 OR name ILIKE $1 OR owner ILIKE $1)";
        queryParams.push(`%${search}%`);
      }

      // Get total count for pagination
      const countQuery = `SELECT COUNT(*) as count FROM repositories ${whereClause}`;
      const countResult = await client.query(countQuery, queryParams);
      const totalCount = parseInt(countResult.rows[0].count);

      // Get repositories with pagination and sorting
      let repositoriesQuery: string;
      let repositoriesParams: any[];

      if (search) {
        // With search parameters
        repositoriesQuery = `
          SELECT
            id, full_name, name, owner, url, homepage, stars, forks,
            created_at, updated_at, last_seen, saved_at, source
          FROM repositories
          WHERE (full_name ILIKE $1 OR name ILIKE $1 OR owner ILIKE $1)
          ORDER BY ${validSortBy} ${validSortOrder} NULLS LAST
          LIMIT $2 OFFSET $3
        `;
        repositoriesParams = [`%${search}%`, limit, offset];
      } else {
        // Without search parameters
        repositoriesQuery = `
          SELECT
            id, full_name, name, owner, url, homepage, stars, forks,
            created_at, updated_at, last_seen, saved_at, source
          FROM repositories
          ORDER BY ${validSortBy} ${validSortOrder} NULLS LAST
          LIMIT $1 OFFSET $2
        `;
        repositoriesParams = [limit, offset];
      }

      const repositoriesResult = await client.query(repositoriesQuery, repositoriesParams);

      const totalPages = Math.ceil(totalCount / limit);

      return NextResponse.json({
        repositories: repositoriesResult.rows,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          limit,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
        sorting: {
          sortBy: validSortBy,
          sortOrder: validSortOrder.toLowerCase(),
        },
        search,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Database error:", error);
    return NextResponse.json({ error: "Failed to fetch repositories" }, { status: 500 });
  }
}
