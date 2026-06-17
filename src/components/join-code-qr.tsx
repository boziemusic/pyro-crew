"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function JoinCodeQr({
  className = "",
  code,
}: {
  className?: string;
  code: string | null | undefined;
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;
    const normalizedCode = code?.trim().toUpperCase() ?? "";

    if (!/^[A-Z0-9]{4}$/.test(normalizedCode)) {
      const resetId = window.setTimeout(() => {
        setQrDataUrl(null);
      }, 0);

      return () => {
        isCancelled = true;
        window.clearTimeout(resetId);
      };
    }

    QRCode.toDataURL(normalizedCode, {
      color: {
        dark: "#020617",
        light: "#f8fafc",
      },
      errorCorrectionLevel: "M",
      margin: 1,
      scale: 6,
    })
      .then((dataUrl) => {
        if (!isCancelled) {
          setQrDataUrl(dataUrl);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setQrDataUrl(null);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [code]);

  if (!qrDataUrl) {
    return (
      <div
        className={`grid aspect-square place-items-center rounded-lg border border-dashed border-white/20 bg-[#0d1324] p-3 text-xs font-semibold text-[#94a3b8] ${className}`}
      >
        QR unavailable
      </div>
    );
  }

  return (
    <div
      aria-label="Technician join code QR"
      className={`rounded-lg border border-white/10 bg-white bg-[length:calc(100%-1rem)_calc(100%-1rem)] bg-center bg-no-repeat p-2 ${className}`}
      role="img"
      style={{ backgroundImage: `url(${qrDataUrl})` }}
    />
  );
}
