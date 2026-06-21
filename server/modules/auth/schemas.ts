import { z } from 'zod';
import { tryNormalizeDrcPhone } from '../../lib/phone.js';

export const CongoPhoneSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const normalized = tryNormalizeDrcPhone(value);
    if (!normalized) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Numéro RDC invalide' });
      return z.NEVER;
    }
    return normalized;
  });

export const PinSchema = z
  .string()
  .regex(/^\d{6}$/, 'PIN invalide');

// Transition: accept 4 OR 6 digits so existing users with a 4-digit PIN
// can still log in and be auto-redirected to create a new 6-digit PIN.
export const LoginPinTransitionSchema = z
  .string()
  .regex(/^\d{4,6}$/, 'PIN invalide');

export const RegisterSchema = z.object({
  phone: CongoPhoneSchema,
  pin: PinSchema,
  adult: z.literal(true, {
    errorMap: () => ({ message: 'Confirmation 18+ requise' }),
  }),
  referralCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{6,12}$/, 'Code parrain invalide')
    .optional()
    .nullable(),
  agentRef: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^AG-[A-Z0-9]{6}$/, 'Code agent invalide')
    .optional()
    .nullable(),
});

export const LoginSchema = z.object({
  phone: CongoPhoneSchema,
  pin: LoginPinTransitionSchema,
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput  = z.infer<typeof LoginSchema>;
