import axios from 'axios'
import { useAuthStore } from '@/context/authStore'

// Relative baseURL is deliberate: works unchanged whether the SPA is served by
// Vite on :5173 (proxied to the API) or embedded in the API's own wwwroot in
// production - no per-environment config needed (see the deploy strategy notes).
export const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout()
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)
