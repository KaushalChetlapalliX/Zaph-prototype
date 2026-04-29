import { supabase } from "./supabase";

type UserLike = {
  email?: string | null;
  id: string;
  user_metadata?: Record<string, unknown> | null;
};

type ProfileRow = {
  display_name?: string | null;
  first_name?: string | null;
  full_name?: string | null;
  last_name?: string | null;
  questionnaire_completed?: boolean | null;
  username?: string | null;
};

function metadataString(
  metadata: Record<string, unknown>,
  keys: string[],
): string {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function deriveNameParts(user: UserLike) {
  const metadata = user.user_metadata ?? {};
  const fullName =
    metadataString(metadata, ["full_name", "name", "display_name"]) ||
    String(user.email ?? "")
      .split("@")[0]
      .replace(/[._-]+/g, " ")
      .trim();

  const firstName = metadataString(metadata, [
    "first_name",
    "firstName",
    "given_name",
    "givenName",
  ]);
  const lastName = metadataString(metadata, [
    "last_name",
    "lastName",
    "family_name",
    "familyName",
  ]);

  if (firstName) {
    return {
      firstName,
      fullName: fullName || [firstName, lastName].filter(Boolean).join(" "),
      lastName,
    };
  }

  const parts = fullName.split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? "",
    fullName,
    lastName: lastName || parts.slice(1).join(" "),
  };
}

function usernameFromUser(user: UserLike): string {
  const seed =
    String(user.email ?? "")
      .split("@")[0]
      .trim() || user.id.slice(0, 12);
  const safe = seed.toLowerCase().replace(/[^a-z0-9]/g, "") || "user";
  return `${safe}_${user.id.slice(0, 6)}`;
}

export async function ensureProfileFromAuthUser(user: UserLike): Promise<{
  profile: ProfileRow | null;
}> {
  const { data: existing, error: loadErr } = await supabase
    .from("profiles")
    .select(
      "username, first_name, last_name, full_name, display_name, questionnaire_completed",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (loadErr) throw new Error(loadErr.message);

  const profile = (existing ?? null) as ProfileRow | null;
  const names = deriveNameParts(user);
  const username = profile?.username?.trim() || usernameFromUser(user);
  const firstName = profile?.first_name?.trim() || names.firstName;
  const lastName = profile?.last_name?.trim() || names.lastName;
  const fullName =
    profile?.full_name?.trim() ||
    names.fullName ||
    [firstName, lastName].filter(Boolean).join(" ");
  const displayName =
    profile?.display_name?.trim() || fullName || firstName || username;

  const needsRepair =
    !profile ||
    !profile.username?.trim() ||
    !profile.first_name?.trim() ||
    !profile.full_name?.trim() ||
    !profile.display_name?.trim();

  if (!needsRepair) return { profile };

  const payload = {
    display_name: displayName,
    first_name: firstName || null,
    full_name: fullName || null,
    id: user.id,
    last_name: lastName || null,
    username,
  };

  const { data: saved, error: saveErr } = await supabase
    .from("profiles")
    .upsert(payload, { onConflict: "id" })
    .select(
      "username, first_name, last_name, full_name, display_name, questionnaire_completed",
    )
    .maybeSingle();

  if (saveErr) throw new Error(saveErr.message);

  return {
    profile: (saved ?? {
      ...profile,
      ...payload,
    }) as ProfileRow,
  };
}
