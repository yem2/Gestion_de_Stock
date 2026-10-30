import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { authorize } from "@/lib/auth";
import { rolesFor } from "@/lib/roles";
import { serverError } from "@/lib/api";

export const runtime = "nodejs";

const TZ = "Africa/Douala";
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Synthèse financière d'une période (par défaut : le mois en cours).
 * Les marges ne portent que sur les lignes de vente dont le coût est connu : le chiffre d'affaires sans coût connu
 * est signalé à part, jamais compté comme une marge de 100 %.
 */
export async function GET(request: Request) {
  const auth = await authorize(request, rolesFor("finance.view"));
  if ("error" in auth) return auth.error;
  const params = new URL(request.url).searchParams;
  const from = DATE.test(params.get("from") ?? "") ? (params.get("from") as string) : null;
  const to = DATE.test(params.get("to") ?? "") ? (params.get("to") as string) : null;
  const companyId = auth.user.companyId;

  try {
    const sql = getSql();
    const range = await sql`
      SELECT COALESCE(${from}::date, date_trunc('month', NOW() AT TIME ZONE ${TZ})::date) AS "from",
             COALESCE(${to}::date, (NOW() AT TIME ZONE ${TZ})::date) AS "to"`;
    const start = String(range[0].from).slice(0, 10);
    const end = String(range[0].to).slice(0, 10);

    const [sales, costs, expenses, byCategory, receivables, payables, accounts, topProducts, stock] = await Promise.all([
      sql`SELECT COALESCE(SUM(total_amount), 0) AS revenue, COUNT(*)::int AS count FROM sales
          WHERE company_id = ${companyId}::uuid AND status = 'completed' AND (created_at AT TIME ZONE ${TZ})::date BETWEEN ${start}::date AND ${end}::date`,
      sql`SELECT COALESCE(SUM(si.quantity * si.unit_cost) FILTER (WHERE si.unit_cost IS NOT NULL), 0) AS cogs,
                 COALESCE(SUM(si.quantity * si.unit_price) FILTER (WHERE si.unit_cost IS NOT NULL), 0) AS "revenueWithCost",
                 COALESCE(SUM(si.quantity * si.unit_price) FILTER (WHERE si.unit_cost IS NULL), 0) AS "revenueWithoutCost"
          FROM sale_items si JOIN sales s ON s.id = si.sale_id
          WHERE s.company_id = ${companyId}::uuid AND s.status = 'completed' AND (s.created_at AT TIME ZONE ${TZ})::date BETWEEN ${start}::date AND ${end}::date`,
      sql`SELECT COALESCE(SUM(amount), 0) AS total FROM expenses
          WHERE company_id = ${companyId}::uuid AND status = 'paid' AND expense_date BETWEEN ${start}::date AND ${end}::date`,
      sql`SELECT c.name AS category, SUM(e.amount) AS total FROM expenses e JOIN expense_categories c ON c.id = e.category_id AND c.company_id = e.company_id
          WHERE e.company_id = ${companyId}::uuid AND e.status = 'paid' AND e.expense_date BETWEEN ${start}::date AND ${end}::date
          GROUP BY c.name ORDER BY SUM(e.amount) DESC`,
      sql`SELECT COALESCE(SUM(due), 0) AS total FROM sale_balances WHERE company_id = ${companyId}::uuid AND status = 'completed' AND due > 0`,
      sql`SELECT COALESCE(SUM(due), 0) AS total FROM purchase_balances WHERE company_id = ${companyId}::uuid AND status IN ('ordered', 'partially_received', 'received') AND due > 0`,
      sql`SELECT name, type, balance FROM account_balances WHERE company_id = ${companyId}::uuid AND status = 'active' ORDER BY CASE type WHEN 'cash' THEN 0 WHEN 'mobile_money' THEN 1 ELSE 2 END, name`,
      sql`SELECT p.name, SUM(si.quantity)::int AS quantity, SUM(si.quantity * si.unit_price) AS revenue, SUM(si.quantity * (si.unit_price - si.unit_cost)) AS margin
          FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN products p ON p.id = si.product_id AND p.company_id = s.company_id
          WHERE s.company_id = ${companyId}::uuid AND s.status = 'completed' AND si.unit_cost IS NOT NULL
            AND (s.created_at AT TIME ZONE ${TZ})::date BETWEEN ${start}::date AND ${end}::date
          GROUP BY p.id, p.name ORDER BY margin DESC LIMIT 5`,
      sql`SELECT COALESCE(SUM(quantity * avg_cost), 0) AS "atCost", COALESCE(SUM(quantity * unit_price), 0) AS "atPrice",
                 COUNT(*) FILTER (WHERE avg_cost = 0 AND quantity > 0)::int AS "unknownCost"
          FROM products WHERE company_id = ${companyId}::uuid AND archived = FALSE`
    ]);

    const revenue = Number(sales[0].revenue);
    const cogs = Number(costs[0].cogs);
    const withCost = Number(costs[0].revenueWithCost);
    const withoutCost = Number(costs[0].revenueWithoutCost);
    const grossMargin = withCost - cogs;
    const expensesTotal = Number(expenses[0].total);
    return NextResponse.json({
      period: { from: start, to: end },
      revenue,
      salesCount: sales[0].count,
      cogs,
      grossMargin,
      marginRate: withCost > 0 ? grossMargin / withCost : null,
      revenueWithoutCost: withoutCost,
      costCoverage: withCost + withoutCost > 0 ? withCost / (withCost + withoutCost) : null,
      expenses: expensesTotal,
      expensesByCategory: byCategory,
      operatingResult: grossMargin - expensesTotal,
      receivables: Number(receivables[0].total),
      payables: Number(payables[0].total),
      accounts,
      topProducts,
      stock: stock[0]
    });
  } catch {
    return serverError();
  }
}
