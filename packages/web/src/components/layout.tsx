import { Outlet, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useGroupInfo } from "../api/queries.js";
import { LanguageToggle } from "./language-toggle.js";
import { ThemeToggle } from "./theme-toggle.js";
import { Loading } from "./loading.js";
import { ErrorMessage } from "./error-message.js";
import { AnimatedNav } from "./animated-nav.js";
import { RouteTransition } from "./route-transition.js";
import { PRIMARY_NAV_ITEMS } from "./navigation.js";

export function Layout() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const { data: group, isLoading, error } = useGroupInfo(slug!);

  if (isLoading) return <Loading />;
  if (error) return <ErrorMessage message={error.message} />;

  const tabs = PRIMARY_NAV_ITEMS.map((item) => ({
    to: item.segment ? `/g/${slug}/${item.segment}` : `/g/${slug}`,
    label: t(`nav.${item.key}`),
    end: item.end,
  }));

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">{group?.name ?? slug}</h1>
        <div className="flex items-center gap-2">
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </header>

      <AnimatedNav tabs={tabs} />

      <RouteTransition>
        <Outlet />
      </RouteTransition>
    </div>
  );
}
