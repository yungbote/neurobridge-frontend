import axiosClient from './AxiosClient';

// creds: { email: string, password: string }
export async function loginUser(creds) {
  const response = await axiosClient.post("/login", creds);
  return response.data;
}
/*
 data: {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
 }
*/
export async function registerUser(data) {
  const response = await axiosClient.post("/register", data);
  return response.data;
}

export async function refreshToken() {
  const response = await axiosClient.post("/refresh");
  return response.data;
}

export async function logoutUser() {
  const response = await axiosClient.post("/logout");
  return response.data;
}

export async function createOAuthNonce(provider) {
  if (!provider) throw new Error("createOAuthNonce: missing provider");
  const response = await axiosClient.post("/oauth/nonce", { provider });
  return response.data;
}

export async function oauthGoogle({ id_token, nonce_id, first_name, last_name }) {
  if (!id_token) throw new Error("oauthGoogle: missing id_token");
  if (!nonce_id) throw new Error("oauthGoogle: missing nonce_id");
  const response = await axiosClient.post("/oauth/google", {
    id_token,
    nonce_id,
    first_name: first_name || "",
    last_name: last_name || "",
  });
  return response.data;
}

export async function oauthApple({ id_token, nonce_id, first_name, last_name }) {
  if (!id_token) throw new Error("oauthApple: missing id_token");
  if (!nonce_id) throw new Error("oauthApple: missing nonce_id");
  const response = await axiosClient.post("/oauth/apple", {
    id_token,
    nonce_id,
    first_name: first_name || "",
    last_name: last_name || "",
  });
  return response.data;
}









