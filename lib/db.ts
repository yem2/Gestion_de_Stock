import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;

export function getSql() {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL n’est pas configurée. Ajoutez la chaîne de connexion Neon dans les variables d’environnement.");
  }
  return neon(databaseUrl);
}
