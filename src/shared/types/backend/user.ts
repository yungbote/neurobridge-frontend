import type { DeletedAt, ISODateTimeString, UUID } from "./common";

export interface BackendUser {
  id: UUID;
  email: string;
  first_name: string;
  last_name: string;
  avatar_bucket_key: string;
  avatar_url: string;
  avatar_color: string;
  preferred_theme: string;
  preferred_ui_theme?: string;
  created_at: ISODateTimeString;
  updated_at: ISODateTimeString;
  deleted_at?: DeletedAt;
}

// Back-compat alias for any downstream use.
export type User = BackendUser;








