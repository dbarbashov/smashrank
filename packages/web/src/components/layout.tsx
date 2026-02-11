import { NavLink, Outlet, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useGroupInfo } from "../api/queries.js";
import { LanguageToggle } from "./language-toggle.js";
import { ThemeToggle } from "./theme-toggle.js";
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
    { to: `/g/${slug}/tournaments`, label: t("nav.tournaments") },
  ];

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{group?.name ?? slug}</h1>
        <div className="flex items-center gap-2">
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </header>

      <nav className="mb-8 flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-800/60">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                isActive
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
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
