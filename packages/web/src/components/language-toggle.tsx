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
      className="rounded-md border border-gray-300 px-2 py-1 text-sm hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700"
    >
      {i18n.language === "en" ? "RU" : "EN"}
    </button>
  );
}
