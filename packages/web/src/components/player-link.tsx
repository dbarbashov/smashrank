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
      className="inline-flex items-center gap-1.5 font-medium text-slate-900 transition-colors hover:text-blue-700 hover:underline dark:text-slate-100 dark:hover:text-blue-300"
    >
      <Avatar playerId={id} name={name} size="sm" />
      {name}
    </Link>
  );
}
