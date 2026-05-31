/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_API_URL: string;
  readonly VITE_WS_URL: string;
  readonly VITE_GAME_IFRAME_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

type OrientationLockType =
  | 'any'
  | 'landscape'
  | 'landscape-primary'
  | 'landscape-secondary'
  | 'natural'
  | 'portrait'
  | 'portrait-primary'
  | 'portrait-secondary';

interface ScreenOrientation {
  lock(orientation: OrientationLockType): Promise<void>;
}
