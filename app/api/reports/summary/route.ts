import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize } from "@/lib/auth";
import { serverError } from "@/lib/api";

export const runtime = "nodejs";

const TZ = "Africa/Douala";

export async function GET(request: Request) {
  const auth = await authorize(request);
  if ("error" in auth) return auth.error;
  const requested = Number(new URL(request.url).searchParams.get("days"));
  const days = [7, 30, 90].includes(requested) ? requested : 7;

  try {
    const sql = getSql();
    const [stock, today, period, daily, payments, top, lowStock, recent] = await Promise.all([
      sql`
        SELECT COUNT(*)::int AS "productCount", COALESCE(SUM(quantity), 0)::int AS units,
               COALESCE(SUM(quantity * unit_price), 0) AS value,
               COUNT(*) FILTER (WHERE quantity <= min_quantity)::int AS "lowCount"
        FROM products WHERE archived = FALSE
      `,
      sql`
        SELECT COALESCE(SUM(total_amount), 0) AS total, COUNT(*)::int AS count
        FROM sales WHERE status = 'completed'
          AND (created_at AT TIME ZONE ${TZ})::date = (NOW() AT TIME ZONE ${TZ})::date
      `,
      sql`
        SELECT COALESCE(SUM(total_amount), 0) AS total, COUNT(*)::int AS count
        FROM sales WHERE status = 'completed' AND created_at >= NOW() - (${days}::int * INTERVAL '1 day')
      `,
      sql`
        SELECT to_char(d.day, 'YYYY-MM-DD') AS day, COALESCE(SUM(s.total_amount), 0) AS total
        FROM generate_series(
          ((NOW() AT TIME ZONE ${TZ})::date - (${days}::int - 1)), (NOW() AT TIME ZONE ${TZ})::date, INTERVAL '1 day'
        ) AS d(day)
        LEFT JOIN sales s ON s.status = 'completed' AND (s.created_at AT TIME ZONE ${TZ})::date = d.day::date
        GROUP BY d.day ORDER BY d.day
      `,
      sql`
        SELECT payment_method AS method, COALESCE(SUM(total_amount), 0) AS total, COUNT(*)::int AS count
        FROM sales WHERE status = 'completed' AND created_at >= NOW() - (${days}::int * INTERVAL '1 day')
        GROUP BY payment_method ORDER BY total DESC
      `,
      sql`
        SELECT p.name, SUM(i.quantity)::int AS quantity, SUM(i.quantity * i.unit_price) AS total
        FROM sale_items i JOIN sales s ON s.id = i.sale_id JOIN products p ON p.id = i.product_id
        WHERE s.status = 'completed' AND s.created_at >= NOW() - (${days}::int * INTERVAL '1 day')
        GROUP BY p.id, p.name ORDER BY total DESC LIMIT 5
      `,
      sql`
        SELECT id, name, sku, quantity, min_quantity AS "minQuantity"
        FROM products WHERE archived = FALSE AND quantity <= min_quantity
        ORDER BY quantity ASC, name ASC LIMIT 8
      `,
      sql`
        SELECT m.id, m.movement_type AS type, m.quantity, m.created_at AS "createdAt", p.name AS "productName"
        FROM stock_movements m JOIN products p ON p.id = m.product_id
        ORDER BY m.created_at DESC, m.id DESC LIMIT 6
      `
    ]);
    return NextResponse.json({
      days,
      stock: stock[0],
      today: today[0],
      period: period[0],
      daily,
      payments,
      top,
      lowStock,
      recent
    });
  } catch {
    return serverError();
  }
}
