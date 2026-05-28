import { z } from 'zod';

export const CongoPhoneSchema = z
  .string()
  .trim()
  .regex(/^0(8[4-9]|9[0-9])\d{7}$/, 'Numéro RDC invalide');

export const PinSchema = z
  .string()
  .regex(/^\d{4,6}$/, 'PIN invalide');

export const RegisterSchema = z.object({
  phone: CongoPhoneSchema,
  pin: PinSchema,
  adult: z.literal(true, {
    errorMap: () => ({ message: 'Confirmation 18+ requise' }),
  }),
});

export const LoginSchema = z.object({
  phone: CongoPhoneSchema,
  pin: PinSchema,
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
