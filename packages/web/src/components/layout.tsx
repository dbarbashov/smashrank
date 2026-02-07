import { NavLink, Outlet, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useGroupInfo } from "../api/queries.js";
import { LanguageToggle } from "./language-toggle.js";
import { Loading } from "./loading.js";
import { ErrorMessage } from "./error-message.js";

export function Layout() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const { data: group, isLoading, error } = useGroupInfo(slug!);

  if (isLoading) return <Loading />;
  if (error) return <ErrorMessage message={error.message} />;

  const tabs = [
    { to: `/g/${slug}`, label: t("nav.leaderboard"), end: true },
    { to: `/g/${slug}/matches`, label: t("nav.matches") },
    { to: `/g/${slug}/achievements`, label: t("nav.achievements") },
    { to: `/g/${slug}/seasons`, label: t("nav.seasons") },
  ];

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 py-4">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">{group?.name ?? slug}</h1>
        <LanguageToggle />
      </header>

      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-gray-200 dark:border-gray-700">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <main>
        <Outlet />
      </main>
    </div>
  );
}
