import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from './components/ui/Toaster'
import { syncAllWithSupabase } from './services/storage'
import Home from './pages/Home'
import Editor from './pages/Editor'
import Schedule from './pages/Schedule'
import Admin from './pages/Admin'
import SharedLayout from './pages/SharedLayout'
import './App.css'

function App() {
  useEffect(() => {
    // Sincroniza dados com o Supabase no plano de fundo ao iniciar o app
    syncAllWithSupabase().catch((err) => {
      console.warn('Falha na sincronização inicial:', err)
    })
  }, [])

  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/editor" element={<Editor />} />
        <Route path="/editor/:id" element={<Editor />} />
        <Route path="/agendar" element={<Schedule />} />
        <Route path="/agendar/:layoutId" element={<Schedule />} />
        <Route path="/layout/:token" element={<SharedLayout />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </>
  )
}

export default App
