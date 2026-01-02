import axios, { type AxiosInstance } from "axios";
import { getAccessToken } from "@/shared/services/StorageService";

// Base URL is set from docker-compose (VITE_API_BASE_URL) or fallback to localhost
const axiosClient: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api",
  timeout: 5000,
});

axiosClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default axiosClient;
