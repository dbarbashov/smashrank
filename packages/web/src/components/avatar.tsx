import { useState } from "react";
import { useParams } from "react-router-dom";

const SIZES = {
  sm: "h-6 w-6 text-xs",
  md: "h-8 w-8 text-sm",
  lg: "h-16 w-16 text-xl",
} as const;

export function Avatar({
  playerId,
  name,
  size = "sm",
}: {
  playerId: string;
  name: string;
  size?: "sm" | "md" | "lg";
}) {
  const { slug } = useParams();
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const sizeClass = SIZES[size];
  const initial = (name || "?").charAt(0).toUpperCase();

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-gray-200 to-gray-300 font-medium text-gray-600 ring-2 ring-white dark:from-gray-700 dark:to-gray-600 dark:text-gray-300 dark:ring-gray-800 ${sizeClass}`}
    >
      <span aria-hidden="true">{initial}</span>
      {!failed && slug ? (
        <img
          src={`/api/g/${slug}/players/${playerId}/avatar`}
          alt={name}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-150 ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
          onError={() => setFailed(true)}
          onLoad={() => setLoaded(true)}
        />
      ) : null}
    </span>
  );
}
