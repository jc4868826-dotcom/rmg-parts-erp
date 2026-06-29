import { createContext, useContext, useState, useEffect } from 'react'
import axios from 'axios'

const AuthContext = createContext(null)

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('rmg_user')
    if (stored) {
      try { setUser(JSON.parse(stored)) } catch { localStorage.removeItem('rmg_user') }
    }
    setLoading(false)
  }, [])

  const login = async (email, password) => {
    const res = await axios.post('/api/auth/login', { email, password })
    const { token, user } = res.data
    localStorage.setItem('rmg_token', token)
    localStorage.setItem('rmg_user', JSON.stringify(user))
    setUser(user)
    return user
  }

  const logout = async () => {
    localStorage.removeItem('rmg_token')
    localStorage.removeItem('rmg_user')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
