import axiosClient from "./AxiosClient";

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
}

export interface AuthTokensResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface OAuthNonceResponse {
  nonce_id: string;
  nonce: string;
}

export async function loginUser(creds: LoginCredentials): Promise<AuthTokensResponse> {
  const response = await axiosClient.post<AuthTokensResponse>("/login", creds);
  return response.data;
}

export async function registerUser(data: RegisterPayload): Promise<AuthTokensResponse> {
  const response = await axiosClient.post<AuthTokensResponse>("/register", data);
  return response.data;
}

export async function refreshToken(): Promise<AuthTokensResponse> {
  const response = await axiosClient.post<AuthTokensResponse>("/refresh");
  return response.data;
}

export async function logoutUser(): Promise<Record<string, unknown>> {
  const response = await axiosClient.post<Record<string, unknown>>("/logout");
  return response.data;
}


// TODO: OAuth not working (google is fine on localhost, apple doesnt need to work atm). Changes might
// need to be implemented on backend. 
export async function createOAuthNonce(provider: string): Promise<OAuthNonceResponse> {
  if (!provider) throw new Error("createOAuthNonce: missing provider");
  const response = await axiosClient.post<OAuthNonceResponse>("/oauth/nonce", { provider });
  return response.data;
}

export async function oauthGoogle({
  id_token,
  nonce_id,
  first_name,
  last_name,
}: {
  id_token: string;
  nonce_id: string;
  first_name?: string;
  last_name?: string;
}): Promise<AuthTokensResponse> {
  if (!id_token) throw new Error("oauthGoogle: missing id_token");
  if (!nonce_id) throw new Error("oauthGoogle: missing nonce_id");
  const response = await axiosClient.post<AuthTokensResponse>("/oauth/google", {
    id_token,
    nonce_id,
    first_name: first_name || "",
    last_name: last_name || "",
  });
  return response.data;
}

export async function oauthApple({
  id_token,
  nonce_id,
  first_name,
  last_name,
}: {
  id_token: string;
  nonce_id: string;
  first_name?: string;
  last_name?: string;
}): Promise<AuthTokensResponse> {
  if (!id_token) throw new Error("oauthApple: missing id_token");
  if (!nonce_id) throw new Error("oauthApple: missing nonce_id");
  const response = await axiosClient.post<AuthTokensResponse>("/oauth/apple", {
    id_token,
    nonce_id,
    first_name: first_name || "",
    last_name: last_name || "",
  });
  return response.data;
}








