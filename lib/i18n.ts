import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";
import en from "@/locales/en.json";
import es from "@/locales/es.json";

const LANGUAGE_KEY = "coachlift_language";

export async function getStoredLanguage(): Promise<string> {
  try {
    return (await AsyncStorage.getItem(LANGUAGE_KEY)) || "en";
  } catch {
    return "en";
  }
}

export async function setStoredLanguage(lang: string): Promise<void> {
  await AsyncStorage.setItem(LANGUAGE_KEY, lang);
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
  },
  lng: "en",
  fallbackLng: "en",
  compatibilityJSON: "v3",
  interpolation: { escapeValue: false },
});

export default i18n;
