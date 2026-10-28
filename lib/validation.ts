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
  /** Montant encaissé à la vente ; absent = totalité. Inférieur au total = vente à crédit (client obligatoire). */
  amountPaid: z.coerce.number().min(0, "Le montant encaissé ne peut pas être négatif").max(1_000_000_000_000).optional(),
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


export const purchaseSchema = z.object({
  supplierId: optionalId,
  note: optionalText(300),
  requireApproval: z.boolean().optional(),
  items: z
    .array(
      z.object({
        productId: z.coerce.number().int().positive("Choisissez un produit"),
        quantity: z.coerce.number().int("Quantité invalide").min(1, "La quantité doit être au moins 1").max(1000000),
        unitCost: z.coerce.number().min(0, "Le coût ne peut pas être négatif").max(1000000000)
      })
    )
    .min(1, "Ajoutez au moins un article")
    .max(50, "50 articles maximum par commande")
});

export const settingsSchema = z.object({
  companyName: z.string().trim().min(2, "Le nom de l’entreprise est obligatoire").max(120),
  address: optionalText(200),
  phone: optionalText(40),
  footer: optionalText(200)
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Saisissez votre mot de passe actuel").max(128),
  newPassword: passwordSchema
});

const warehouseId = z.string().uuid("Entrepôt invalide");

export const warehouseSchema = z.object({
  name: z.string().trim().min(2, "Le nom doit contenir au moins 2 caractères").max(120),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(2, "Le code doit contenir au moins 2 caractères")
    .max(20)
    .regex(/^[A-Z0-9_-]+$/, "Le code ne peut contenir que des lettres, chiffres, tirets")
});

export const warehouseUpdateSchema = warehouseSchema.partial().extend({
  status: z.enum(["active", "inactive"]).optional()
});

export const transferSchema = z
  .object({
    sourceId: warehouseId,
    destinationId: warehouseId,
    note: optionalText(300),
    lines: z
      .array(
        z.object({
          productId: z.coerce.number().int().positive("Choisissez un produit"),
          quantity: z.coerce.number().int("Quantité invalide").min(1, "La quantité doit être positive").max(100000000)
        })
      )
      .min(1, "Ajoutez au moins un produit")
      .max(200)
  })
  .refine((value) => value.sourceId !== value.destinationId, {
    message: "Les entrepôts d’origine et de destination doivent être différents",
    path: ["destinationId"]
  })
  .refine((value) => new Set(value.lines.map((line) => line.productId)).size === value.lines.length, {
    message: "Un produit ne peut apparaître qu’une seule fois dans un transfert",
    path: ["lines"]
  });

export const inventoryCreateSchema = z.object({ warehouseId: z.string().uuid("Entrepôt invalide") });

export const inventorySaveSchema = z.object({
  lines: z
    .array(
      z.object({
        productId: z.coerce.number().int().positive(),
        counted: z.union([z.coerce.number().int("Quantité invalide").min(0, "La quantité ne peut pas être négative").max(100000000), z.null()])
      })
    )
    .min(1)
    .max(5000)
});

export const barcodeSchema = z.object({
  barcode: z
    .string()
    .trim()
    .min(3, "Le code-barres doit contenir au moins 3 caractères")
    .max(64, "Le code-barres est trop long")
    .regex(/^[A-Za-z0-9._\/-]+$/, "Le code-barres ne peut contenir que des lettres, chiffres et . _ / -")
});

/** Réception d'une commande : sans lignes, tout le reste à recevoir est réceptionné. */
export const receiveSchema = z.object({
  note: optionalText(300),
  lines: z
    .array(
      z.object({
        itemId: z.coerce.number().int().positive(),
        received: z.coerce.number().int("Quantité invalide").min(0, "La quantité ne peut pas être négative").max(1000000),
        rejected: z.coerce.number().int("Quantité invalide").min(0, "La quantité ne peut pas être négative").max(1000000)
      })
    )
    .min(1)
    .max(100)
    .optional()
});

export const paymentSchema = z.object({
  direction: z.enum(["in", "out"]),
  customerId: optionalId,
  supplierId: optionalId,
  amount: z.coerce.number().positive("Le montant doit être positif").max(1_000_000_000_000),
  methodId: z.string().uuid("Mode de paiement invalide"),
  reference: optionalText(120),
  note: optionalText(300),
  allocations: z
    .array(
      z.object({
        documentType: z.enum(["sale", "purchase_order"]),
        documentId: z.coerce.number().int().positive(),
        amount: z.coerce.number().positive("Le montant affecté doit être positif").max(1_000_000_000_000)
      })
    )
    .max(100)
    .optional()
});

export const paymentReverseSchema = z.object({
  reason: z.string().trim().min(3, "Indiquez le motif de la contrepassation").max(300)
});

export const mobilePaymentSchema = z.object({
  provider: z.enum(["orange_money", "mtn_money"]),
  phone: z.string().trim().max(30).optional(),
  customerId: optionalId,
  amount: z.coerce.number().positive("Le montant doit être positif").max(1_000_000_000_000),
  reference: optionalText(120),
  allocations: z
    .array(
      z.object({
        documentType: z.literal("sale"),
        documentId: z.coerce.number().int().positive(),
        amount: z.coerce.number().positive("Le montant affecté doit être positif").max(1_000_000_000_000)
      })
    )
    .min(1, "Choisissez la vente à encaisser")
    .max(20)
});
