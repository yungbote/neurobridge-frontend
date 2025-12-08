import axiosClient from './AxiosClient'

export async function getMe() {
  const resp = await axiosClient.get("/me");
  const raw = resp.data.me;
  if (!raw) {
    throw new Error("Missing 'me' in /me response");
  }
  const user = {
    id: raw.id,
    email: raw.email,
    firstName: raw.first_name,
    lastName: raw.last_name,
    avatarUrl: raw.avatar_url
  };
  return { user };
}

