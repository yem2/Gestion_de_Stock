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

export const passwordSchema = z
  .string()
  .min(10, "Le mot de passe doit contenir au moins 10 caractères")
  .max(128)
  .refine((value) => /[A-Za-z]/.test(value) && /\d/.test(value), "Le mot de passe doit contenir des lettres et des chiffres");

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(180),
  password: z.string().min(1).max(128)
});

export const setupSchema = z.object({
  setupKey: z.string().min(1).max(200),
  name: z.string().trim().min(2).max(160),
  email: z.string().trim().toLowerCase().email().max(180),
  password: passwordSchema
});

export const userCreateSchema = z.object({
  name: z.string().trim().min(2, "Le nom doit contenir au moins 2 caractères").max(160),
  email: z.string().trim().toLowerCase().email("E-mail invalide").max(180),
  password: passwordSchema,
  role: z.enum(["admin", "manager", "storekeeper", "seller"])
});

export const userUpdateSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  role: z.enum(["admin", "manager", "storekeeper", "seller"]).optional(),
  active: z.boolean().optional(),
  password: passwordSchema.optional()
});

export const productUpdateSchema = z
  .object({
    sku: z.string().trim().min(1, "La référence est obligatoire").max(80).optional(),
    name: z.string().trim().min(2, "Le nom doit contenir au moins 2 caractères").max(160).optional(),
    category: z.string().trim().max(100).optional(),
    unitPrice: z.coerce.number().min(0).max(100000000000).optional(),
    minQuantity: z.coerce.number().int().min(0).max(100000000).optional(),
    archived: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, { message: "Aucune modification fournie." });

export const movementSchema = z
  .object({
    productId: z.coerce.number().int().positive("Produit invalide"),
    type: z.enum(["in", "out", "adjustment"]),
    // Entrée / sortie : quantité déplacée. Ajustement : nouvelle quantité comptée en inventaire.
    quantity: z.coerce.number().int().min(0).max(100000000),
    note: z.string().trim().max(300).optional()
  })
  .refine((value) => value.type === "adjustment" || value.quantity > 0, {
    message: "La quantité doit être supérieure à 0.",
    path: ["quantity"]
  });
