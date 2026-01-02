import type { DeletedAt, ISODateTimeString, UUID } from "./common";
import type { User } from "./user";

export interface UserIdentity {
  id: UUID;
  user_id: UUID;
  user?: User;
  provider: string;
  provider_sub: string;
  email: string;
  email_verified: boolean;
  created_at: ISODateTimeString;
  updated_at: ISODateTimeString;
  deleted_at?: DeletedAt;
}










