import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";

export default function Screen() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
      <Text style={{ fontSize: 24, fontWeight: "700" }}>Create Circle</Text>

      <Pressable
        onPress={() => router.push("circle-home")}
        style={{ paddingVertical: 12, paddingHorizontal: 18, backgroundColor: "black", borderRadius: 10 }}
      >
        <Text style={{ color: "white", fontWeight: "600" }}>Next</Text>
      </Pressable>

      <Pressable onPress={() => router.back()}>
        <Text>Back</Text>
      </Pressable>
    </View>
  );
}
