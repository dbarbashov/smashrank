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

  const sizeClass = SIZES[size];
  const initial = (name || "?").charAt(0).toUpperCase();

  if (failed || !slug) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-full bg-gray-200 font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300 ${sizeClass}`}
      >
        {initial}
      </span>
    );
  }

  return (
    <img
      src={`/api/g/${slug}/players/${playerId}/avatar`}
      alt={name}
      className={`rounded-full object-cover ${sizeClass}`}
      onError={() => setFailed(true)}
    />
  );
}
