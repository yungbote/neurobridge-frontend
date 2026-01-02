import axiosClient from "./AxiosClient";
import type { BackendUser } from "@/shared/types/backend";
import { UI_THEME_SET } from "@/shared/theme/uiThemes";
import type { ThemePreference, UiTheme, UserProfile } from "@/shared/types/models";

export async function getMe(): Promise<{ user: UserProfile }> {
  const resp = await axiosClient.get<{ me?: BackendUser | null }>("/me");
  const raw = resp.data.me;
  if (!raw) {
    throw new Error("Missing 'me' in /me response");
  }
  const preferredUiThemeRaw = String(raw.preferred_ui_theme ?? "").trim();
  const preferredUiTheme = UI_THEME_SET.has(preferredUiThemeRaw as UiTheme)
    ? (preferredUiThemeRaw as UiTheme)
    : "classic";
  const user: UserProfile = {
    id: String(raw.id),
    email: raw.email,
    firstName: raw.first_name,
    lastName: raw.last_name,
    avatarUrl: raw.avatar_url,
    preferredTheme: (raw.preferred_theme ?? "system") as ThemePreference,
    preferredUiTheme,
    avatarColor: raw.avatar_color ?? null,
  };
  return { user };
}

export async function changeName(data: { first_name: string; last_name: string }): Promise<void> {
  await axiosClient.patch("/user/name", data);
}

export async function changeTheme(data: {
  preferred_theme?: ThemePreference;
  preferred_ui_theme?: UiTheme;
}): Promise<void> {
  await axiosClient.patch("/user/theme", data);
}

export async function changeAvatarColor(data: { avatar_color: string }): Promise<void> {
  // data: { avatar_color: "#RRGGBB" }
  await axiosClient.patch("/user/avatar_color", data);
}

export async function uploadAvatar(file: File): Promise<void> {
  // file is a File object
  const form = new FormData();
  form.append("file", file);

  await axiosClient.post("/user/avatar/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
}







