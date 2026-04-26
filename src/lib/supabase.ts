import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// On web, use localStorage directly so the session survives a full page reload
// on Vercel. AsyncStorage's web shim is async and the Supabase client can race
// the first render before it returns, leaving the user signed out on refresh.
const webStorage =
  typeof window !== "undefined" && window.localStorage
    ? {
        getItem: (k: string) => window.localStorage.getItem(k),
        setItem: (k: string, v: string) => window.localStorage.setItem(k, v),
        removeItem: (k: string) => window.localStorage.removeItem(k),
      }
    : undefined;

export const supabase = createClient(url, anon, {
  auth: {
    storage: Platform.OS === "web" ? webStorage : AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: Platform.OS === "web",
  },
});
