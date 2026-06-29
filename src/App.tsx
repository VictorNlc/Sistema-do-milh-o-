import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from './components/ui/Toaster'
import { syncAllWithSupabase } from './services/storage'
import { supabase } from './services/supabase'
import Home from './pages/Home'
import Editor from './pages/Editor'
import SharedLayout from './pages/SharedLayout'
import Projects from './pages/Projects'
import ClientIntakeForm from './pages/ClientIntakeForm'
import './App.css'

function App() {
  useEffect(() => {
    // Inicia sessão anônima no Supabase para que cada navegador tenha um auth.uid()
    // Isso permite que o RLS proteja os layouts por dono, sem exigir cadastro
    const initSession = async () => {
      if (!supabase) return
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        await supabase.auth.signInAnonymously()
      }
    }
    initSession().catch(err => console.warn('[Auth] Falha ao iniciar sessão anônima:', err))

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
        <Route path="/layout/:token" element={<SharedLayout />} />
        <Route path="/meus-projetos" element={<Projects />} />
        <Route path="/novo-layout" element={<ClientIntakeForm />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </>
  )
}

export default App
