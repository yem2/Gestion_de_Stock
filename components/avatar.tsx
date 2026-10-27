"use client";

import { useState } from "react";

function initialsOf(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "U";
}

/** Photo de profil, ou initiales si l'utilisateur n'en a pas (ou si elle ne se charge pas). */
export default function Avatar({ userId, name, version, size = 38 }: { userId: string | number; name: string; version?: number | string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.36)) };
  if (version && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img className="avatar avatar-img" style={style} src={`/api/users/${userId}/avatar?v=${version}`} alt="" onError={() => setFailed(true)} />
    );
  }
  return <div className="avatar" style={style} aria-hidden="true">{initialsOf(name)}</div>;
}
