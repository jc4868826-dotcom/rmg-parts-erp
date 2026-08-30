import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@context/AuthContext'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const { login } = useAuth()
  const navigate  = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await login(email, password)
      navigate('/dashboard')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center relative"
      style={{
        backgroundImage: "url('/fondo_rmg.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* Velo claro sobre la imagen — mantiene la marca sin oscurecer la pantalla */}
      <div className="absolute inset-0" style={{ background: 'rgba(243, 245, 248, 0.82)' }} />

      {/* Panel de login — encima del velo */}
      <div className="relative z-10 w-full max-w-sm px-4">

        {/* Logo */}
        <div className="flex items-center justify-center mb-8">
          <img src="/logo-rmg.png" alt="RMG Parts" style={{ height: '52px', width: 'auto', objectFit: 'contain' }} />
        </div>

        {/* Panel */}
        <div
          className="p-8 rounded-2xl"
          style={{
            background: '#ffffff',
            border: '1px solid rgba(15, 35, 60, 0.1)',
            boxShadow: '0 24px 60px rgba(15, 35, 60, 0.18)',
          }}
        >
          <h1 className="font-bold text-lg text-center mb-1" style={{ color: 'var(--rmg-text)' }}>Acceso al sistema</h1>
          <p className="text-xs text-center mb-6" style={{ color: 'var(--rmg-muted)' }}>Plataforma B2B · Santiago RM</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>
                Email
              </label>
              <input
                type="email"
                className="rmg-input"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--rmg-muted)' }}>
                Contraseña
              </label>
              <input
                type="password"
                className="rmg-input"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Ingresando...' : 'Ingresar al sistema'}
            </button>
          </form>
        </div>

        <p className="text-xs text-center mt-5" style={{ color: 'rgba(15, 35, 60,0.3)' }}>
          RMG Parts · Distribución mayorista automotriz · Santiago RM
        </p>
      </div>
    </div>
  )
}
