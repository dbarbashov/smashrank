import { useTranslation } from "react-i18next";

export function LanguageToggle() {
  const { i18n } = useTranslation();

  const toggle = () => {
    const next = i18n.language === "en" ? "ru" : "en";
    i18n.changeLanguage(next);
    localStorage.setItem("smashrank-lang", next);
  };

  return (
    <button
      onClick={toggle}
      className="flex h-8 items-center justify-center rounded-lg border border-slate-200 px-2.5 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
    >
      {i18n.language === "en" ? "RU" : "EN"}
    </button>
  );
}
