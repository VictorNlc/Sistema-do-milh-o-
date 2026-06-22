#  Documentação Técnica — ProjeLayout (by Projefarma)

Bem-vindo à documentação oficial do **ProjeLayout**, uma ferramenta interativa desenvolvida para a **Projefarma** que permite aos farmacêuticos e proprietários planejar, visualizar e otimizar a disposição do layout físico de suas lojas de forma automatizada e manual (2D e 3D).

---

##  1. Visão Geral da Arquitetura

O sistema é construído sob uma arquitetura moderna baseada em componentes SPA (Single Page Application) com design fluido e premium:

*   **Frontend core**: React 19 + TypeScript + Vite.
*   **Interface Gráfica 2D**: HTML5 Canvas manipulado através de **Konva** e **React-Konva**.
*   **Interface Gráfica 3D**: Renderização e modelagem em tempo real usando **Three.js**.
*   **Armazenamento e Sincronização**: Abordagem *Offline-first* via `localStorage` com sincronização em tempo real bidirecional no plano de fundo com o banco de dados na nuvem **Supabase**.
*   **Estilização**: Vanilla CSS com variáveis centralizadas em design tokens no arquivo `index.css`.
*   **Processamento e IA**: Conexão com API da OpenAI para geração inteligente de móveis e otimização de espaço.

---

##  2. Estrutura de Pastas e Componentes

A estrutura de arquivos do diretório `src/` está organizada por responsabilidades específicas:

```bash
src/
├── assets/         # Recursos estáticos (imagens, ícones)
├── components/     # Componentes React reutilizáveis
│   ├── admin/      # Telas administrativas internas
│   ├── ai/         # Interface e lógica de chat com IA
│   ├── canvas/     # Edição gráfica 2D (Konva), 3D Viewer e painéis de ergonomia/orçamento
│   └── ui/         # Componentes universais (Toaster, botões globais)
├── config/         # Configurações gerais
├── data/           # Dados pré-definidos (gôndolas, balcões, etc.)
├── pages/          # Páginas/Rotas da aplicação (Home, Editor, Admin, etc.)
├── services/       # Módulos de lógica de negócios, IA, exportações e validação
├── store/          # Gerenciamento de estado global com Zustand
├── types/          # Definições de tipos do TypeScript
└── utils/          # Funções utilitárias (cálculos geométricos, formatação)
```

---

##  3. Fluxo de Estado Global (`canvasStore`)

O estado da planta e do layout da farmácia é gerenciado pelo **Zustand** no arquivo `src/store/canvasStore.ts`. Esse store gerencia:

1.  **Dimensões da Loja**: Largura (`storeWidth`) e comprimento (`storeHeight`) em metros.
2.  **Itens no Canvas**: Uma lista de `CanvasItem` que contém posição `(x, y)` em metros, tamanho, ângulo de rotação, categoria e metadados para renderização 3D.
3.  **Histórico (Desfazer/Refazer)**: Histórico de snapshots locais de até 50 alterações para comandos de Undo/Redo.
4.  **Meta-dados**: Tipo da Farmácia (`StoreType`: Popular, Premium, Manipulação, Completa) e Densidade de móveis.
5.  **Cálculos de Métricas**:
    *   **Área Total / Área Ocupada / Área de Circulação**.
    *   **Taxa de Ocupação** (idealmente mantida abaixo de 55%).
    *   **Lista de pilares e obstáculos estruturais**.

---

##  4. Serviços e Módulos de Negócios

A inteligência e as exportações do sistema estão centralizadas na pasta `src/services/`:

###  A. Otimização de Layout e IA
*   **`heuristicLayoutGenerator.ts`**: Motor algorítmico que calcula matematicamente as posições ideais para cada tipo de móvel (ex.: gôndolas em fileiras paralelas respeitando distâncias de circulação, balcões nos fundos, caixa perto da saída).
*   **`chatGptLayoutGenerator.ts`**: Integração com a API do ChatGPT para criar, alterar ou reposicionar móveis através de comandos em linguagem natural no painel lateral do editor.

###  B. Auditoria Ergonômica (`ergonomyValidator.ts`)
Valida as regras de espaçamento físico da farmácia baseado na norma **NBR 9050** de acessibilidade:
*   **Corredor para Cadeirantes**: Identifica se há qualquer espaço entre módulos de móveis inferior a **0,90m** (Erro Crítico).
*   **Corredor Confortável**: Identifica distâncias menores que **1,20m** (Aviso de circulação reduzida para carrinhos).
*   **Obstrução da Entrada**: Verifica se há móveis ou pilares na área de **1,50m** imediatamente interna após a porta de entrada.
*   **Visibilidade de MIPs**: Garante que medicamentos isentos de prescrição (MIPs) estejam posicionados a até **3,0m** dos balcões de atendimento para fiscalização e auxílio farmacêutico.

###  C. Simulação de Fluxo (`customerSimulation.ts` & `heatmapGenerator.ts`)
*   Simula dinamicamente a trajetória que clientes fariam pela farmácia com base no tipo da loja (ex.: fluxo direcionado ao balcão de prescrição no fundo, passando pela perfumaria).
*   Gera um **Mapa de Calor** visual no canvas para demonstrar as zonas quentes de maior tráfego na farmácia.

###  D. Exportações e Relatórios
*   **`pdfExport.ts`**: Gera um relatório oficial em formato PDF contendo a planta baixa da farmácia, miniaturas visuais, estatísticas de ocupação e a lista detalhada de mobiliários com valores e códigos.
*   **`excelExport.ts`**: Exporta uma planilha Excel (`.xlsx`) com o orçamento descritivo, dimensões e acabamento de cada móvel adicionado.
*   **`sketchupVision.ts`**: Permite converter ou processar metadados do layout para compatibilidade com softwares de arquitetura como SketchUp.

---

##  5. Sincronização com Banco de Dados (Supabase)

O arquivo `src/services/storage.ts` coordena a persistência de dados. A sincronização funciona de maneira assíncrona:
*   Sempre que um layout é alterado ou um agendamento é salvo, os dados são atualizados instantaneamente no `localStorage`.
*   A seguir, uma requisição assíncrona tenta enviar os dados para as tabelas `layouts` e `appointments` no Supabase.
*   Ao abrir a aplicação (`App.tsx`), a função `syncAllWithSupabase()` executa uma sincronização bidirecional completa, atualizando modificações remotas mais novas ou enviando alterações locais salvas em modo offline.

---

##  6. Como Rodar e Testar Localmente

Certifique-se de ter o [Node.js](https://nodejs.org) instalado.

### 1. Instalar as Dependências
```bash
npm install
```

### 2. Configurar Variáveis de Ambiente
Verifique ou configure o arquivo `.env` na raiz do projeto com as chaves corretas:
```env
VITE_OPENAI_API_KEY=sua-chave-aqui
VITE_SUPABASE_URL=https://sua-url.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anonima
```

### 3. Iniciar o Servidor de Desenvolvimento
```bash
npm run dev
```

### 4. Construir para Produção
```bash
npm run build
```
O build final será gerado dentro da pasta `dist/`.
