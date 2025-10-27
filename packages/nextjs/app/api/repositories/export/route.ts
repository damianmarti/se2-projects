import { NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
});

export async function GET() {
  let client;

  try {
    client = await pool.connect();

    // Fetch all repositories
    const result = await client.query(`
      SELECT
        id, full_name, name, owner, url, homepage, stars, forks,
        created_at, updated_at, last_seen, saved_at, source
      FROM repositories
      ORDER BY id
    `);

    const repositories = result.rows;

    // Convert to CSV format
    const headers = [
      "ID",
      "Full Name",
      "Name",
      "Owner",
      "URL",
      "Homepage",
      "Stars",
      "Forks",
      "Created At",
      "Updated At",
      "Last Seen",
      "Saved At",
      "Source",
    ];

    // Create CSV content
    const csvRows = [
      headers.join(","),
      ...repositories.map(repo => {
        return [
          repo.id,
          `"${repo.full_name}"`,
          `"${repo.name}"`,
          `"${repo.owner}"`,
          `"${repo.url}"`,
          repo.homepage ? `"${repo.homepage}"` : "",
          repo.stars || 0,
          repo.forks || 0,
          repo.created_at || "",
          repo.updated_at || "",
          repo.last_seen || "",
          repo.saved_at || "",
          `"${(repo.source || []).join("; ")}"`,
        ].join(",");
      }),
    ];

    const csvContent = csvRows.join("\n");

    // Return CSV file
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="repositories-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json({ error: "Failed to export repositories", details: String(error) }, { status: 500 });
  } finally {
    if (client) {
      client.release();
    }
  }
}
