import axios from 'axios';
import { getToken } from '@/services/StorageService';

// Base URL is set from docker-compose (VITE_API_BASE_URL) or fallback to localhost
const axiosClient = axios.Create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 5000,
});

axiosClient.interceptors.request.use((config) => {
  const token = getToken();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default axiosClient;
