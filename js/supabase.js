// ============================================================
//  Configuración de Supabase — GALLO
//  1. Creá un proyecto gratis en https://supabase.com
//  2. Settings → API: copiá "Project URL" y "anon public" key
//  3. Pegá los valores acá abajo
// ============================================================
export const SUPABASE_URL = 'https://qotpitwdtnaocwftwkkr.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvdHBpdHdkdG5hb2N3ZnR3a2tyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1NTMwMzYsImV4cCI6MjEwMjEyOTAzNn0.QdoLGXCpgnUaxuzl5UWwjJ7o_rJkJQOGfJJTHmTUE_8';

// Datos del negocio (se usan para armar links de WhatsApp)
export const WHATSAPP = '5493416684947';

// ¿Está configurado? (si no, el catálogo muestra productos de ejemplo)
export const CONFIGURED =
  !SUPABASE_URL.includes('TU-PROYECTO') && !SUPABASE_ANON_KEY.includes('TU-ANON');

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const supabase = CONFIGURED
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// Nombre de la tabla y del bucket de storage
export const TABLE = 'productos';
export const BUCKET = 'productos';

// Formatea un precio en pesos argentinos
export function formatPrecio(n){
  if(n === null || n === undefined || n === '') return 'Consultar';
  const num = Number(n);
  if(Number.isNaN(num)) return 'Consultar';
  return '$' + num.toLocaleString('es-AR');
}

// Link de WhatsApp para consultar por un producto
export function waProducto(nombre){
  const txt = `Hola Gallo! Quiero consultar por: ${nombre}`;
  return `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(txt)}`;
}
