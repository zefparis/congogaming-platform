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

export const OkapiBetBodySchema = z.object({
  amount_cdf: z.number().int().min(100).max(50_000),
  auto_session_id: z.string().uuid().nullable().optional(),
  currency: z.enum(['CDF', 'CGLT']).default('CDF'),
});

export const OkapiCashoutBodySchema = z.object({
  bet_id: z.string().uuid(),
});

export const KycScanBodySchema = z.object({
  selfie_b64: z.string().min(100).max(7_000_000),
});

export const OkapiAutoStartBodySchema = z.object({
  bet_amount_cdf: z.number().int().min(100),
  target_multiplier: z.number().min(1.01),
  max_rounds: z.number().int().positive().nullable().optional(),
  stop_on_profit_cdf: z.number().int().positive().nullable().optional(),
  stop_on_loss_cdf: z.number().int().positive().nullable().optional(),
});

export const OkapiAutoProgressBodySchema = z.object({
  session_id: z.string().uuid(),
  delta_cdf: z.number().int(),
  expected_rounds_played: z.number().int().nonnegative().optional(),
});

export const OkapiAutoStopBodySchema = z.object({
  session_id: z.string().uuid(),
  reason: z.enum(['completed', 'stopped', 'aborted']).optional(),
});

export const LotoTicketBodySchema = z.object({
  numeros: z.array(z.number().int().min(1).max(49)).length(6),
});

export const FlashTicketBodySchema = z.object({
  numeros: z.array(z.number().int().min(1).max(20)).length(5),
});

export const ScratchBuyBodySchema = z.object({
  bet_amount_cdf: z.number().int(),
});

export const ScratchClaimBodySchema = z.object({
  ticket_id: z.string().min(1),
});

export const OkapiColorTicketBodySchema = z.object({
  numeros: z.array(z.number().int().min(1).max(24)).length(6),
});
