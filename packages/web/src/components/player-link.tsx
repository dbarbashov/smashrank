import { Link, useParams } from "react-router-dom";
import { Avatar } from "./avatar.js";

export function PlayerLink({
  id,
  name,
}: {
  id: string;
  name: string;
}) {
  const { slug } = useParams();
  return (
    <Link
      to={`/g/${slug}/player/${id}`}
      className="inline-flex items-center gap-1.5 font-medium text-blue-600 transition-colors hover:text-blue-700 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
    >
      <Avatar playerId={id} name={name} size="sm" />
      {name}
    </Link>
  );
}
