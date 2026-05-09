import { createContext, useContext } from "react";
import { en } from "./en";
import { es } from "./es";
import { ja } from "./ja";
import { ko } from "./ko";
import { ptBr } from "./pt-br";
import { ru } from "./ru";
import { zhCn } from "./zh-cn";
import { zhTw } from "./zh-tw";
import type { LocaleSchema } from "./en";

export type SupportedLocale = "en" | "ja" | "zh-cn" | "ko" | "zh-tw" | "es" | "pt-br" | "ru";
export type LocaleSetting = "auto" | SupportedLocale;

const locales: Record<SupportedLocale, LocaleSchema> = {
  en,
  ja,
  "zh-cn": zhCn,
  ko,
  "zh-tw": zhTw,
  es,
  "pt-br": ptBr,
  ru,
};

export function resolveLocale(setting: LocaleSetting, vscodeLanguage: string): SupportedLocale {
  if (setting !== "auto") return setting;
  // vscode.env.language は "ja", "en", "zh-cn", "zh-tw", "ko", "es", "pt-br", "ru" など
  if (vscodeLanguage.startsWith("ja")) return "ja";
  if (vscodeLanguage === "zh-cn") return "zh-cn";
  if (vscodeLanguage === "zh-tw") return "zh-tw";
  if (vscodeLanguage.startsWith("ko")) return "ko";
  if (vscodeLanguage.startsWith("es")) return "es";
  if (vscodeLanguage === "pt-br") return "pt-br";
  if (vscodeLanguage.startsWith("ru")) return "ru";
  return "en";
}

export function getStrings(locale: SupportedLocale): LocaleSchema {
  return locales[locale] ?? locales.en;
}

// React Context
const LocaleContext = createContext<LocaleSchema>(en);

export const LocaleProvider = LocaleContext.Provider;

export function useLocale(): LocaleSchema {
  return useContext(LocaleContext);
}
