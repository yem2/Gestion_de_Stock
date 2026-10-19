import { z } from "zod";

export const productInputSchema = z.object({
  sku: z.string().trim().min(1, "La référence est obligatoire").max(80),
  name: z.string().trim().min(2, "Le nom doit contenir au moins 2 caractères").max(160),
  category: z.string().trim().max(100).default("Général"),
  quantity: z.coerce.number().int().min(0).max(100000000),
  unitPrice: z.coerce.number().min(0).max(100000000000),
  minQuantity: z.coerce.number().int().min(0).max(100000000).default(0)
});

export type ProductInput = z.infer<typeof productInputSchema>;
