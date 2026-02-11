import { useTranslation } from "react-i18next";

export function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <h1 className="text-6xl font-bold text-slate-300 dark:text-slate-700">404</h1>
      <p className="mt-3 text-slate-500 dark:text-slate-400">{t("common.notFoundMessage")}</p>
    </div>
  );
}
