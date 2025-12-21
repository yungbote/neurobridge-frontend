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
    avatarUrl: raw.avatar_url,
    preferredTheme: raw.preferred_theme ?? "system",
    avatarColor: raw.avatar_color ?? null,
  };
  return { user };
}


export async function changeName(data) {
  await axiosClient.patch("/user/name", data);
}

export async function changeTheme(data) {
  await axiosClient.patch("/user/theme", data);
}

export async function changeAvatarColor(data) {
  // data: { avatar_color: "#RRGGBB" }
  await axiosClient.patch("/user/avatar_color", data);
}

export async function uploadAvatar(file) {
  // file is a File object
  const form = new FormData();
  form.append("file", file);

  await axiosClient.post("/user/avatar/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
}










