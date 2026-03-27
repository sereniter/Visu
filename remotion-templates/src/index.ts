import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root";

registerRoot(RemotionRoot);

export { RemotionRoot } from "./Root";
export * from "./compositions/AnukramAIIntro";
export * from "./compositions/AnukramAISummary";
export * from "./compositions/SceneTitleCard";
export * from "./compositions/ProgressOverlay";
export * from "./TransitionComposition";
export * from "./SceneComposition";
export * from "./types";
