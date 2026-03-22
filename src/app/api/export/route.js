import { buildToisCsv } from "../../lib/tois-csv";

export async function POST(request) {
  try {
    const formData = await request.formData();
    const rowsJson = formData.get("rows");
    const rows = JSON.parse(rowsJson);

    const csv = buildToisCsv(rows);

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="svodnaya-tois.csv"',
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
