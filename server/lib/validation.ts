import { z } from 'zod';
import { tryNormalizeDrcPhone } from './phone.js';

export const ProviderIdSchema = z.union([z.literal(10), z.literal(17), z.literal(19)]);

export const PhoneSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const normalized = tryNormalizeDrcPhone(value);
    if (!normalized) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Téléphone RDC invalide' });
      return z.NEVER;
    }
    return normalized;
  });

export const DepositBodySchema = z.object({
  amount: z.number().int().min(100).max(5_000_000),
  provider_id: ProviderIdSchema,
  phone: PhoneSchema,
});

export const WithdrawBodySchema = z.object({
  amount: z.number().int().min(500).max(2_000_000),
  provider_id: ProviderIdSchema,
  phone: PhoneSchema,
});

export const KycScanBodySchema = z.object({
  selfie_b64: z
    .string()
    .min(100)
    .max(2_800_000)
    .refine(
      (v) => /^[A-Za-z0-9+/]+=*$/.test(v),
      'selfie_b64 must be valid base64',
    ),
});

export const OkapiColorTicketBodySchema = z.object({
  numeros: z.array(z.number().int().min(1).max(24)).length(6),
});
