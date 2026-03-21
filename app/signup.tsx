import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, SafeAreaView } from "react-native";
import { router } from "expo-router";
import { supabase } from "../src/lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSignIn = async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      alert(error.message);
      return;
    }

    router.replace("/user-home");
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.title}>Log in</Text>

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Email Address"
              placeholderTextColor="#666666"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#666666"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <Pressable onPress={handleSignIn} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Log in</Text>
          </Pressable>

          <Pressable onPress={() => router.push("/create-account")} style={styles.linkButton}>
            <Text style={styles.linkText}>New here, create an account</Text>
          </Pressable>

          <Pressable
            onPress={() => alert("Google login is not set up right now.")}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>Continue with Google</Text>
          </Pressable>

          <Pressable
            onPress={() => alert("Apple login is not set up right now.")}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>Continue with Apple</Text>
          </Pressable>
        </View>

        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F8EEFF" },
  container: {
    flex: 1,
    backgroundColor: "#F8EEFF",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
    justifyContent: "center",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 30,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  title: { fontSize: 28, fontWeight: "700", color: "#000000", marginBottom: 24 },
  inputContainer: { marginBottom: 20 },
  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#000000",
    borderRadius: 25,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    color: "#000000",
  },
  primaryButton: {
    backgroundColor: "#8A2BE2",
    borderRadius: 25,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  primaryButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
  linkButton: { marginTop: 14, marginBottom: 18, alignItems: "center" },
  linkText: { color: "#000000", fontSize: 14, textDecorationLine: "underline" },
  secondaryButton: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#000000",
    borderRadius: 25,
    paddingVertical: 16,
    marginBottom: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: { color: "#000000", fontSize: 16, fontWeight: "500" },
  backButton: { marginTop: 24, alignItems: "center", paddingVertical: 12 },
  backButtonText: { color: "#000000", fontSize: 16 },
});
