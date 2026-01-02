import type { ThemePreference, UiTheme } from "./common";

export interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string;
  avatarColor: string | null;
  preferredTheme: ThemePreference;
  preferredUiTheme: UiTheme;
}
