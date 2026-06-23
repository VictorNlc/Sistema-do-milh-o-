/// <reference types="vite/client" />

// Vite ?raw imports — retorna conteúdo do arquivo como string
declare module '*.csv?raw' {
  const content: string
  export default content
}

interface ImportMetaEnv {
  readonly VITE_OPENAI_API_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
