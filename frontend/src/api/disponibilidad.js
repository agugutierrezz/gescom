import { getToken, ApiError } from './client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * GET /disponibilidad/pdf?departamento_id=&anio=&mes=
 * Descarga el calendario de disponibilidad del mes en PDF.
 */
export async function descargarPdfDisponibilidad(departamentoId, anio, mes) {
  const params = new URLSearchParams({
    departamento_id: departamentoId,
    anio,
    mes,
  });
  const res = await fetch(`${API_URL}/disponibilidad/pdf?${params}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(data?.detail || `Error ${res.status}`, res.status);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `disponibilidad_${anio}-${String(mes).padStart(2, '0')}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
