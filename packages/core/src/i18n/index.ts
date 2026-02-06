import i18next, { type TFunction } from "i18next";
import en from "./en.json" with { type: "json" };
import ru from "./ru.json" with { type: "json" };

let initialized = false;

export async function initI18n(): Promise<void> {
  if (initialized) return;
  await i18next.init({
    lng: "en",
    fallbackLng: "en",
    resources: {
      en: { translation: en },
      ru: { translation: ru },
    },
    keySeparator: false,
    interpolation: {
      escapeValue: false,
    },
  });
  initialized = true;
}

export function getT(language: string): TFunction {
  return i18next.getFixedT(language);
}

export function t(
  language: string,
  key: string,
  options?: Record<string, unknown>,
): string {
  return i18next.t(key, { lng: language, ...options });
}
