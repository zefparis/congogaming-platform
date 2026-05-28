/**
 * Canonical phone normalisation for DRC mobile numbers.
 *
 * Canonical form stored in DB and used internally: `0XXXXXXXXX` (10 digits,
 * leading zero), e.g. `0997174837`.
 *
 * Accepted user input formats (auto-normalised):
 *   0997174837       (canonical)
 *   997174837        (missing leading 0)
 *   243997174837     (E.164 without +)
 *   +243997174837    (E.164 with +)
 *   00243997174837   (international 00 prefix)
 *   spaces / dashes / dots / non-breaking spaces are stripped
 *
 * Validation: must end up as `0(8[4-9]|9[0-9])\d{7}` — i.e. valid DRC mobile
 * MNO prefixes (Vodacom 81/82/83/84/85, Airtel 97/98/99, Africell 90/91/92).
 */

const DRC_MOBILE_REGEX = /^0(8[1-9]|9[0-9])\d{7}$/;

export function normalizeDrcPhone(input: string): string {
  if (typeof input !== 'string') {
    throw new Error('PHONE_INVALID');
  }
  // Strip every character that is not a digit (whitespace, +, -, ., (, ), etc.)
  let digits = input.replace(/[^\d]/g, '');

  // Drop international `00` prefix if present (00243... -> 243...)
  if (digits.startsWith('00')) digits = digits.slice(2);

  // Strip country code 243 (covers both `243XXXXXXXXX` and `+243XXXXXXXXX`)
  if (digits.startsWith('243')) digits = digits.slice(3);

  // Add leading zero if missing (provider callbacks sometimes return raw 9XXXXXXXX)
  if (digits.length === 9 && /^[89]/.test(digits)) {
    digits = '0' + digits;
  }

  if (!DRC_MOBILE_REGEX.test(digits)) {
    throw new Error('PHONE_INVALID');
  }
  return digits;
}

export function tryNormalizeDrcPhone(input: string): string | null {
  try {
    return normalizeDrcPhone(input);
  } catch {
    return null;
  }
}

/**
 * Format a canonical DRC phone for the format expected by Unipesa / AvadaPay,
 * per provider. The input MUST already be canonical (`0XXXXXXXXX`).
 *
 * AvadaPay supports only 3 MNOs in DRC:
 *   10 — Orange Money     -> `0XXXXXXXXX` (with leading 0)
 *   17 — Airtel Money     -> `XXXXXXXXX`  (no leading 0)
 *   19 — Africell         -> `0XXXXXXXXX` (with leading 0)
 */
export function normalizePhoneForProvider(canonicalPhone: string, provider_id: number): string {
  // Defensive re-normalisation in case the caller passed a non-canonical value.
  const canonical = normalizeDrcPhone(canonicalPhone);
  if (provider_id === 17) {
    return canonical.slice(1); // drop leading 0 (Airtel callback format)
  }
  // Orange (10) and Africell (19) expect local format with leading 0
  return canonical;
}

/**
 * Known DRC mobile prefixes by MNO (canonical local form, 3 digits after the 0).
 * Used to validate that the user picked the correct provider for their number,
 * BEFORE debiting the wallet or hitting AvadaPay (otherwise the provider
 * returns `MSISDN2 INCORRECT` and we waste a debit).
 *
 * Note: prefix `099` is historically shared between Airtel and Africell in some
 * batches. We accept it for both.
 */
const PROVIDER_PREFIXES: Record<number, RegExp> = {
  10: /^0(84|85|89)\d{7}$/, // Orange
  17: /^0(97|98|99)\d{7}$/, // Airtel
  19: /^0(90|91|92|99)\d{7}$/, // Africell
};

export function phoneMatchesProvider(canonicalPhone: string, provider_id: number): boolean {
  const regex = PROVIDER_PREFIXES[provider_id];
  if (!regex) return false;
  return regex.test(canonicalPhone);
}

