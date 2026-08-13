"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

export function PwaSplash() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timeout = window.setTimeout(() => setVisible(false), 850);
    return () => window.clearTimeout(timeout);
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pwa-splash"
      data-visible={visible || undefined}
    >
      <Image
        alt=""
        height={180}
        priority
        src="/brand/daygym-mark.png"
        unoptimized
        width={180}
      />
    </div>
  );
}
