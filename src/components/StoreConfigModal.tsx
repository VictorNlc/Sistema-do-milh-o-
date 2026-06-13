// src/components/StoreConfigModal.tsx
import React, { useState } from 'react';
import { useCanvasStore } from '../store/canvasStore';
import { toast } from '../store/toastStore';
import type { LayoutDensity } from '../types';

interface Pillar {
  x: number;
  y: number;
}

interface Door {
  x: number;
  y: number;
  orientation: 'N' | 'S' | 'E' | 'W';
}

export default function StoreConfigModal({ onClose }: { onClose: () => void }) {
  const store = useCanvasStore();
  const { storeWidth, storeHeight, layoutDensity, pillars, entrance, emergencyExit } = store;

  const [width, setWidth] = useState(storeWidth);
  const [height, setHeight] = useState(storeHeight);
  const [density, setDensity] = useState<LayoutDensity>(layoutDensity || 'normal');
  const [pillarsText, setPillarsText] = useState(JSON.stringify(pillars, null, 2));
  const [entranceText, setEntranceText] = useState(
    JSON.stringify(entrance ?? { x: 0, y: 0, orientation: 'N' }, null, 2)
  );
  const [exitText, setExitText] = useState(
    JSON.stringify(emergencyExit ?? { x: 0, y: 0, orientation: 'N' }, null, 2)
  );

  const parseJson = <T,>(text: string, fallback: T): T => {
    try {
      return JSON.parse(text) as T;
    } catch (_) {
      return fallback;
    }
  };

  const handleSave = () => {
    const newPillars = parseJson<Pillar[]>(pillarsText, []);
    const newEntrance = parseJson<Door | null>(entranceText, null);
    const newExit = parseJson<Door | null>(exitText, null);

    store.setStoreDimensions(Number(width) || 10, Number(height) || 12);
    store.setStoreType('premium'); // Linha única
    store.setLayoutDensity(density);
    store.setPillars(newPillars);
    if (newEntrance) store.setEntrance(newEntrance);
    if (newExit) store.setEmergencyExit(newExit);
    store.setConfigured(true);
    toast.success('Configurações da loja salvas');
    onClose();
  };

  return (
    <div className="modal-overlay" style={overlayStyle}>
      <div className="modal-content" style={contentStyle}>
        <h2 style={{ marginBottom: '1rem' }}>Configurações da Loja</h2>
        <div className="form-group" style={groupStyle}>
          <label>Largura (m)</label>
          <input
            type="number"
            value={width}
            onChange={e => setWidth(Number(e.target.value) || 0)}
            className="input input-sm"
          />
        </div>
        <div className="form-group" style={groupStyle}>
          <label>Comprimento (m)</label>
          <input
            type="number"
            value={height}
            onChange={e => setHeight(Number(e.target.value) || 0)}
            className="input input-sm"
          />
        </div>
        <div className="form-group" style={groupStyle}>
          <label>Linha</label>
          <div className="input input-sm" style={{ background: 'var(--surface)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            ⭐ Farmácia Premium
          </div>
        </div>
        <div className="form-group" style={groupStyle}>
          <label>Densidade do Layout (Corredores)</label>
          <select
            value={density}
            onChange={e => setDensity(e.target.value as any)}
            className="input input-sm"
          >
            <option value="spacious">🍃 Livre / Amplo (Corredores de 1.2m)</option>
            <option value="normal">📐 Padrão / Equilibrado (Corredores de 1.0m)</option>
            <option value="compact">🛒 Compacto / Apertado (Corredores de 0.8m)</option>
          </select>
        </div>
        <div className="form-group" style={groupStyle}>
          <label>Pilares (JSON)</label>
          <textarea
            rows={4}
            value={pillarsText}
            onChange={e => setPillarsText(e.target.value)}
            className="input input-sm"
          />
        </div>
        <div className="form-group" style={groupStyle}>
          <label>Porta de Entrada (JSON)</label>
          <textarea
            rows={2}
            value={entranceText}
            onChange={e => setEntranceText(e.target.value)}
            className="input input-sm"
          />
        </div>
        <div className="form-group" style={groupStyle}>
          <label>Saída de Emergência (JSON)</label>
          <textarea
            rows={2}
            value={exitText}
            onChange={e => setExitText(e.target.value)}
            className="input input-sm"
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleSave}>
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const contentStyle: React.CSSProperties = {
  background: 'var(--surface-card)',
  padding: '1.5rem',
  borderRadius: 'var(--r-md)',
  boxShadow: 'var(--sh-lg)',
  width: '420px',
  maxHeight: '90vh',
  overflowY: 'auto',
};

const groupStyle: React.CSSProperties = {
  marginBottom: '0.75rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
};
