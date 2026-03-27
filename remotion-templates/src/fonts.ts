import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadDevanagari } from "@remotion/google-fonts/NotoSansDevanagari";
import { loadFont as loadTelugu } from "@remotion/google-fonts/NotoSansTelugu";

export const loadFontsForLanguage = (language: string): void => {
  loadInter();
  if (language === "hi") {
    loadDevanagari();
  }
  if (language === "te") {
    loadTelugu();
  }
};

export const fontFamilyForLanguage = (language: string): string => {
  switch (language) {
    case "hi":
      return '"Noto Sans Devanagari", Inter, sans-serif';
    case "te":
      return '"Noto Sans Telugu", Inter, sans-serif';
    case "ta":
      return '"Noto Sans Tamil", Inter, sans-serif';
    default:
      return "Inter, sans-serif";
  }
};

