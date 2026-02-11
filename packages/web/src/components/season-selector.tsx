import { useTranslation } from "react-i18next";
import type { Season } from "../types.js";

export function SeasonSelector({
  seasons,
  value,
  onChange,
}: {
  seasons: Season[];
  value: string;
  onChange: (id: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
    >
      <option value="">{t("seasons.current")}</option>
      {seasons.filter((s) => !s.is_active).map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}
