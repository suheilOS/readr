import { useState } from "react";

export function SiteFavicon({ hostname }: { hostname: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) return null;

  return (
    <img
      className="site-favicon"
      src={`/api/favicon?host=${encodeURIComponent(hostname)}`}
      alt=""
      width="16"
      height="16"
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
