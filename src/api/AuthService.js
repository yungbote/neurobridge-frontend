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
  const response = await axiosClient.post("/refesh");
  return response.data;
}

export async function logoutUser() {
  const response = await axiosClient.post("/logout");
  return response.data;
}










