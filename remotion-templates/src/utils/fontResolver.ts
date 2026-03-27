import { loadFont as loadBebasNeue } from "@remotion/google-fonts/BebasNeue";
import { loadFont as loadOswald } from "@remotion/google-fonts/Oswald";
import { loadFont as loadAnton } from "@remotion/google-fonts/Anton";
import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";
import { loadFont as loadRoboto } from "@remotion/google-fonts/Roboto";
import { loadFont as loadLora } from "@remotion/google-fonts/Lora";
import { loadFont as loadHind } from "@remotion/google-fonts/Hind";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadNotoSans } from "@remotion/google-fonts/NotoSans";
import { loadFont as loadNotoSansDevanagari } from "@remotion/google-fonts/NotoSansDevanagari";
import { loadFont as loadNotoSansTelugu } from "@remotion/google-fonts/NotoSansTelugu";
import { loadFont as loadRamabhadra } from "@remotion/google-fonts/Ramabhadra";
import { loadFont as loadLeagueGothic } from "@remotion/google-fonts/LeagueGothic";
import type { FontsConfig } from "../types";

type FontLoader = () => { fontFamily: string };

const fontLoaders: Record<string, FontLoader> = {
  "Bebas Neue": () => loadBebasNeue(),
  Oswald: () => loadOswald(),
  Anton: () => loadAnton(),
  Montserrat: () => loadMontserrat(),
  Roboto: () => loadRoboto(),
  Lora: () => loadLora(),
  Hind: () => loadHind(),
  Inter: () => loadInter(),
  "Noto Sans": () => loadNotoSans(),
  "Noto Sans Devanagari": () => loadNotoSansDevanagari(),
  "Noto Sans Telugu": () => loadNotoSansTelugu(),
  Ramabhadra: () => loadRamabhadra(),
  "League Gothic": () => loadLeagueGothic(),
};

const loadedFontFamilies: Record<string, string> = {};

export function loadAndResolveFont(fontName: string): string {
  if (loadedFontFamilies[fontName]) return loadedFontFamilies[fontName];

  const loader = fontLoaders[fontName];
  if (!loader) return `${fontName}, sans-serif`;

  const { fontFamily } = loader();
  loadedFontFamilies[fontName] = fontFamily;
  return fontFamily;
}

export function resolveFontFamily(
  fontsConfig: FontsConfig,
  styleName: string | undefined,
  language: string | undefined,
  role: "heading" | "body",
): string {
  const langConfig = language ? fontsConfig.languages[language] : undefined;
  if (langConfig) {
    return loadAndResolveFont(langConfig[role]);
  }

  const styleConfig = styleName ? fontsConfig.styles[styleName] : undefined;
  if (styleConfig) {
    return loadAndResolveFont(styleConfig[role]);
  }

  return loadAndResolveFont(role === "heading" ? "Bebas Neue" : "Montserrat");
}
