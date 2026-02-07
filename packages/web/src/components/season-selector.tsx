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
      className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800"
    >
      <option value="">{t("seasons.current")}</option>
      {seasons.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}
