import { useLocalSearchParams } from "expo-router";
import { CircleCodeSheet } from "../src/components/CircleCodeSheet";

export default function CircleCode() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const rawMode = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const initialMode = rawMode === "create" ? "create" : "join";

  return <CircleCodeSheet initialMode={initialMode} />;
}
