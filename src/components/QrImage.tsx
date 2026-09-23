import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/**
 * Locally-generated QR code (no third-party image service).
 * Renders a data-URL PNG via the `qrcode` package.
 */
export function useQrDataUrl(value: string | null | undefined, size: number): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!value) { setUrl(null); return; }
    let cancelled = false;
    QRCode.toDataURL(value, { width: size, margin: 1, errorCorrectionLevel: 'M' })
      .then((u) => { if (!cancelled) setUrl(u); })
      .catch(() => { if (!cancelled) setUrl(null); });
    return () => { cancelled = true; };
  }, [value, size]);
  return url;
}

export default function QrImage({
  value,
  size = 200,
  className,
  alt = 'QR Code',
}: {
  value: string | null | undefined;
  size?: number;
  className?: string;
  alt?: string;
}) {
  const url = useQrDataUrl(value, size);
  if (!url) {
    return <div style={{ width: size, height: size }} className={className} aria-label={alt} />;
  }
  return <img src={url} alt={alt} width={size} height={size} className={className} />;
}
