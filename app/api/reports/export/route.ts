import { getSql } from "@/lib/db";
import { authorize, logAudit } from "@/lib/auth";
import { rolesFor } from "@/lib/roles";
import { fail, serverError } from "@/lib/api";

export const runtime = "nodejs";

type Cell = string | number | boolean | Date | null | undefined;

/** Neutralise les formules Excel (=, +, -, @) et protège les séparateurs. */
function cell(value: Cell) {
  if (value === null || value === undefined) return "";
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csv(headers: string[], rows: Cell[][]) {
  return "\uFEFF" + [headers, ...rows].map((row) => row.map(cell).join(";")).join("\r\n");
}

export async function GET(request: Request) {
  const auth = await authorize(request, rolesFor("reports.view"));
  if ("error" in auth) return auth.error;
  const type = new URL(request.url).searchParams.get("type");
  const TZ = "Africa/Douala";

  try {
    const sql = getSql();
    let body = "";
    if (type === "products") {
      const rows = await sql`
        SELECT sku, name, category, quantity, unit_price, min_quantity, quantity * unit_price AS value
        FROM products WHERE company_id = ${auth.user.companyId}::uuid AND archived = FALSE ORDER BY name
      `;
      body = csv(
        ["Référence", "Produit", "Catégorie", "Quantité", "Prix unitaire (FCFA)", "Seuil minimum", "Valeur (FCFA)"],
        rows.map((r) => [r.sku, r.name, r.category, r.quantity, r.unit_price, r.min_quantity, r.value])
      );
    } else if (type === "movements") {
      const rows = await sql`
        SELECT to_char(m.created_at AT TIME ZONE ${TZ}, 'YYYY-MM-DD HH24:MI') AS date, p.name, m.movement_type,
               m.quantity, m.note, s.name AS supplier, u.name AS author
        FROM stock_movements m JOIN products p ON p.id = m.product_id
        LEFT JOIN suppliers s ON s.id = m.supplier_id LEFT JOIN users u ON u.id = m.user_id
        WHERE m.company_id = ${auth.user.companyId}::uuid
        ORDER BY m.created_at DESC LIMIT 5000
      `;
      const labels: Record<string, string> = { in: "Entrée", out: "Sortie", adjustment: "Inventaire" };
      body = csv(
        ["Date", "Produit", "Type", "Quantité", "Note", "Fournisseur", "Auteur"],
        rows.map((r) => [r.date, r.name, labels[String(r.movement_type)] ?? r.movement_type, r.quantity, r.note, r.supplier, r.author])
      );
    } else if (type === "sales") {
      const rows = await sql`
        SELECT s.id, to_char(s.created_at AT TIME ZONE ${TZ}, 'YYYY-MM-DD HH24:MI') AS date, s.status, s.payment_method,
               s.total_amount, c.name AS customer, u.name AS seller
        FROM sales s LEFT JOIN customers c ON c.id = s.customer_id LEFT JOIN users u ON u.id = s.user_id
        WHERE s.company_id = ${auth.user.companyId}::uuid
        ORDER BY s.created_at DESC LIMIT 5000
      `;
      const statuses: Record<string, string> = { completed: "Terminée", cancelled: "Annulée", draft: "Brouillon" };
      const methods: Record<string, string> = { cash: "Espèces", orange_money: "Orange Money", mtn_money: "MTN Money", card: "Carte bancaire" };
      body = csv(
        ["N°", "Date", "Statut", "Paiement", "Total (FCFA)", "Client", "Vendeur"],
        rows.map((r) => [r.id, r.date, statuses[String(r.status)] ?? r.status, methods[String(r.payment_method)] ?? r.payment_method, r.total_amount, r.customer, r.seller])
      );
    } else {
      return fail("Type d’export inconnu.");
    }
    await logAudit(auth.user.id, "export", "report", type ?? undefined);
    return new Response(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${type}-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "no-store"
      }
    });
  } catch {
    return serverError("Export impossible.");
  }
}
