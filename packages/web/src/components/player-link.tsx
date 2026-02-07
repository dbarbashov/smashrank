import { Link, useParams } from "react-router-dom";

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
      className="font-medium text-blue-600 hover:underline dark:text-blue-400"
    >
      {name}
    </Link>
  );
}
