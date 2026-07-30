import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@context/AuthContext'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const [email, setEmail]       = useState('admin@rmgautoparts.cl')
  const [password, setPassword] = useState('rmg2026')
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
      {/* Overlay oscuro sobre la imagen */}
      <div className="absolute inset-0" style={{ background: 'rgba(3, 10, 22, 0.72)' }} />

      {/* Panel de login — encima del overlay */}
      <div className="relative z-10 w-full max-w-sm px-4">

        {/* Logo */}
        <div className="flex items-center gap-3 justify-center mb-8">
          <div className="flex gap-1.5">
            <div className="w-3 h-10 rounded-sm" style={{ background: 'var(--rmg-blue)' }} />
            <div className="w-3 h-10 rounded-sm" style={{ background: 'var(--rmg-teal)' }} />
            <div className="w-3 h-10 rounded-sm" style={{ background: 'var(--rmg-purple)' }} />
          </div>
          <div>
            <div className="font-black text-3xl tracking-wider text-white" style={{ fontFamily: 'Inter Tight, sans-serif' }}>RMG</div>
            <div className="text-xs font-semibold tracking-widest" style={{ color: 'var(--rmg-muted)' }}>AUTO PARTS</div>
          </div>
        </div>

        {/* Panel semitransparente con blur */}
        <div
          className="p-8 rounded-2xl"
          style={{
            background: 'rgba(5, 15, 30, 0.75)',
            backdropFilter: 'blur(18px)',
            WebkitBackdropFilter: 'blur(18px)',
            border: '1px solid rgba(56, 182, 255, 0.18)',
            boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
          }}
        >
          <h1 className="font-bold text-lg text-center mb-1 text-white">Acceso al sistema</h1>
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

          <div className="mt-5 p-3 rounded-lg text-xs" style={{ background: 'rgba(56,182,255,0.06)', border: '1px solid rgba(56,182,255,0.12)' }}>
            <div className="font-semibold mb-1" style={{ color: 'var(--rmg-blt)' }}>Credenciales de prueba</div>
            <div style={{ color: 'var(--rmg-muted)' }}>admin@rmgautoparts.cl · rmg2026</div>
          </div>
        </div>

        <p className="text-xs text-center mt-5" style={{ color: 'rgba(255,255,255,0.3)' }}>
          RMG Parts · Distribución mayorista automotriz · Santiago RM
        </p>
      </div>
    </div>
  )
}
