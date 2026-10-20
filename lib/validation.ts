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

const optionalEmail = z.union([z.literal(""), z.string().trim().toLowerCase().email("E-mail invalide").max(180)]).optional();
const optionalText = (max: number) => z.string().trim().max(max).optional();
const optionalId = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? undefined : value),
  z.coerce.number().int().positive().optional()
);

export const productUpdateSchema = productInputSchema.omit({ quantity: true }).partial();

export const movementSchema = z
  .object({
    productId: z.coerce.number().int().positive("Choisissez un produit"),
    type: z.enum(["in", "out", "adjustment"]),
    quantity: z.coerce.number().int("Quantité invalide").min(0).max(100000000),
    note: optionalText(300),
    supplierId: optionalId
  })
  .refine((value) => value.type === "adjustment" || value.quantity > 0, {
    message: "La quantité doit être supérieure à 0",
    path: ["quantity"]
  });

export const contactSchema = z.object({
  name: z.string().trim().min(2, "Le nom doit contenir au moins 2 caractères").max(160),
  phone: optionalText(40),
  email: optionalEmail,
  address: optionalText(300)
});

export const PAYMENT_METHODS = ["cash", "orange_money", "mtn_money", "card"] as const;

export const saleSchema = z.object({
  customerId: optionalId,
  paymentMethod: z.enum(PAYMENT_METHODS),
  items: z
    .array(
      z.object({
        productId: z.coerce.number().int().positive("Choisissez un produit"),
        quantity: z.coerce.number().int("Quantité invalide").min(1, "La quantité doit être au moins 1").max(1000000)
      })
    )
    .min(1, "Ajoutez au moins un article")
    .max(50, "50 articles maximum par vente")
});

export const forgotSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail invalide").max(180)
});

export const resetSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema
});

export const recoverSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail invalide").max(180),
  recoveryKey: z.string().min(1).max(200)
});
