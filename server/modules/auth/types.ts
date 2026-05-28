export type KycStatus = 'pending' | 'approved' | 'denied' | 'verify_age';

export type AuthUser = {
  id: string;
  phone: string;
  balance_cdf: number;
  kyc_status: KycStatus;
  blocked: boolean;
};

export type JwtUserPayload = {
  sub: string;
  phone: string;
  iat: number;
  exp: number;
};
