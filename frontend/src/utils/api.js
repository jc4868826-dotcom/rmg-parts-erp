import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use(config => {
  const token = localStorage.getItem('rmg_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('rmg_token')
      localStorage.removeItem('rmg_user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export { api }
export default api
