import { useTranslation } from "react-i18next";

export function ErrorMessage({ message }: { message?: string }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center text-red-700 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-400">
      {message || t("common.error")}
    </div>
  );
}
