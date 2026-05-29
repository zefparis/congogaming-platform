export type KycStatus = 'pending' | 'approved' | 'denied' | 'verify_age';

export type AuthUser = {
  id: string;
  phone: string;
  display_name: string | null;
  balance_cdf: number;
  kyc_status: KycStatus;
  blocked: boolean;
  referral_code: string | null;
};

export type JwtUserPayload = {
  sub: string;
  phone: string;
  iat: number;
  exp: number;
};
