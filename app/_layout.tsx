import "react-native-url-polyfill/auto";
import { Stack } from "expo-router";

export default function Layout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="user-home" options={{ animation: "none" }} />
      <Stack.Screen name="create-circle" options={{ animation: "none" }} />
      <Stack.Screen name="settings" options={{ animation: "none" }} />
      <Stack.Screen
        name="circle-code"
        options={{
          presentation: "transparentModal",
          animation: "fade",
        }}
      />
    </Stack>
  );
}
