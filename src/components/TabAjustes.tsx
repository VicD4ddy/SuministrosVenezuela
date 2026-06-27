'use client';

import React, { useState } from 'react';
import { Moon, CheckCircle, LogIn, LogOut, Mail, Lock, Loader2, Shield, Phone } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { TabAdmin } from './TabAdmin';
import { CentroAcopioConDetalles } from '../types/database.types';

interface TabAjustesProps {
  oledDark: boolean;
  onToggleOled: () => void;
  centros: CentroAcopioConDetalles[];
  refetch: () => Promise<void>;
}

export function TabAjustes({ oledDark, onToggleOled, centros, refetch }: TabAjustesProps) {
  const { user, isAdmin, loading: authLoading, error: authError, signIn, signUp, signOut, updatePhone, setError } = useAuth();
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [telefono, setTelefono] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [success, setSuccess] = useState('');

  // Estados para edición de teléfono
  const [telefonoEdit, setTelefonoEdit] = useState('');
  const [updatingPhone, setUpdatingPhone] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [phoneSuccess, setPhoneSuccess] = useState(false);

  React.useEffect(() => {
    if (user?.user_metadata?.telefono) {
      setTelefonoEdit(user.user_metadata.telefono);
    }
  }, [user]);

  const handleActualizarTelefono = async () => {
    setPhoneSuccess(false);
    setPhoneError('');
    const telLimpio = telefonoEdit.replace(/\D/g, '');
    if (telLimpio.length < 10) {
      setPhoneError('Ingrese un número de teléfono válido (mínimo 10 dígitos).');
      return;
    }
    setUpdatingPhone(true);
    const ok = await updatePhone(telefonoEdit.trim());
    setUpdatingPhone(false);
    if (ok) {
      setPhoneSuccess(true);
      setTimeout(() => setPhoneSuccess(false), 3000);
    } else {
      setPhoneError('Error al actualizar el teléfono.');
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess('');
    setError('');
    
    if (!email.trim() || !password.trim()) {
      setError('Complete email y contraseña.');
      return;
    }

    if (isSignUp) {
      const telLimpio = telefono.replace(/\D/g, '');
      if (telLimpio.length < 10) {
        setError('Ingrese un número de teléfono válido de contacto (mínimo 10 dígitos).');
        return;
      }
    }

    const ok = isSignUp
      ? await signUp(email.trim(), password, { telefono: telefono.trim() })
      : await signIn(email.trim(), password);

    if (ok) {
      setSuccess(isSignUp ? '¡Cuenta creada con éxito!' : '¡Sesión iniciada!');
      setEmail('');
      setPassword('');
      setTelefono('');
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-4" role="tabpanel" id="panel-ajustes" aria-label="Ajustes del sistema">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Ajustes del Sistema</h2>
        <p className="text-xs text-gray-500 mt-1">Administración, roles y preferencias.</p>
      </div>

      {/* SECCIÓN OLED */}
      <div className="border border-gray-100 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
              <Moon className="w-4 h-4 text-red-700 shrink-0" aria-hidden="true" />
              Modo Ahorro de Energía (OLED)
            </h3>
            <p className="text-[10px] text-gray-500 leading-normal">
              Apaga píxeles negros en pantallas AMOLED para prolongar batería.
            </p>
          </div>
          <button
            type="button"
            onClick={onToggleOled}
            className={`w-12 h-6 flex items-center rounded-full p-1 transition-all ${oledDark ? 'bg-red-700 justify-end' : 'bg-gray-200 justify-start'}`}
            role="switch"
            aria-checked={oledDark}
            aria-label="Activar modo oscuro OLED"
          >
            <span className="w-4 h-4 rounded-full bg-white shadow-md transition-all"></span>
          </button>
        </div>
      </div>

      {/* SECCIÓN AUTH */}
      <div className="border border-gray-100 rounded-xl p-4 space-y-3">
        {user ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle className={`w-5 h-5 ${isAdmin ? 'text-blue-600' : 'text-emerald-600'} shrink-0`} />
              <div>
                <span className="text-sm font-bold text-gray-800">
                  {isAdmin ? 'Coordinador Verificado' : 'Sesión Activa'}
                </span>
                <p className="text-[10px] text-gray-500">{user.email}</p>
              </div>
            </div>

            {/* Sección Editar Teléfono */}
            <div className="border border-gray-100 bg-gray-50/50 rounded-xl p-3 space-y-2">
              <label htmlFor="edit-telefono" className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                Teléfono de Contacto Celular
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Phone className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2" />
                  <input
                    id="edit-telefono"
                    type="tel"
                    placeholder="Ej. 04121234567"
                    value={telefonoEdit}
                    onChange={e => setTelefonoEdit(e.target.value)}
                    className="w-full pl-9 pr-3 py-1 text-xs bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 font-semibold text-gray-800"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleActualizarTelefono}
                  disabled={updatingPhone}
                  className="px-3.5 py-1 bg-gray-900 hover:bg-black text-white font-bold text-xs rounded-lg active:scale-95 transition-all disabled:opacity-50"
                >
                  {updatingPhone ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
              {phoneError && <p className="text-red-600 text-[10px] font-bold">{phoneError}</p>}
              {phoneSuccess && (
                <p className="text-emerald-700 text-[10px] font-bold flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600" /> ¡Teléfono actualizado!
                </p>
              )}
            </div>

            {isAdmin && (
              <>
                <p className="text-xs text-blue-700 bg-blue-50 border border-blue-100 p-2 rounded-lg">
                  Tus reportes se marcan como oficiales con insignia de verificación.
                </p>
                <button type="button" onClick={() => setShowAdminPanel(true)}
                  className="w-full py-2 bg-red-700 hover:bg-red-800 text-white font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-transform"
                  aria-label="Abrir panel de administración">
                  <Shield className="w-3.5 h-3.5 fill-white/10" />ABRIR PANEL DE CONTROL
                </button>
              </>
            )}
            <button onClick={signOut}
              className="w-full py-2 bg-white text-red-700 border border-red-200 font-bold text-xs rounded-lg hover:bg-red-50 flex items-center justify-center gap-1.5"
              aria-label="Cerrar sesión">
              <LogOut className="w-3.5 h-3.5" />Cerrar Sesión
            </button>
          </div>
        ) : (
          <form onSubmit={handleAuth} className="space-y-3">
            <h3 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
              <LogIn className="w-4 h-4 text-gray-600" />
              {isSignUp ? 'Crear Cuenta' : 'Iniciar Sesión'}
            </h3>

            {authError && <p className="text-red-600 text-xs font-bold" role="alert">{authError}</p>}
            {success && <p className="text-emerald-700 text-xs font-bold" role="alert">{success}</p>}

            <div className="space-y-2">
              <div className="relative">
                <Mail className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" aria-hidden="true" />
                <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 font-medium text-gray-800"
                  aria-label="Correo electrónico" autoComplete="email" />
              </div>
              
              {isSignUp && (
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" aria-hidden="true" />
                  <input type="tel" placeholder="Teléfono celular (ej. 04121234567)" value={telefono} onChange={e => setTelefono(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 font-medium text-gray-800"
                    aria-label="Número telefónico" autoComplete="tel" required />
                </div>
              )}

              <div className="relative">
                <Lock className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" aria-hidden="true" />
                <input type="password" placeholder="Contraseña" value={password} onChange={e => setPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 font-medium text-gray-800"
                  aria-label="Contraseña" autoComplete={isSignUp ? 'new-password' : 'current-password'} />
              </div>
            </div>

            <button type="submit" disabled={authLoading}
              className="w-full py-2 bg-gray-900 hover:bg-black text-white text-xs font-bold rounded-lg shadow flex items-center justify-center gap-1.5 disabled:opacity-50">
              {authLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              {isSignUp ? 'CREAR CUENTA' : 'INICIAR SESIÓN'}
            </button>

            <button type="button" onClick={() => { setIsSignUp(!isSignUp); setError(''); setSuccess(''); }}
              className="w-full text-xs text-gray-500 hover:text-gray-700 font-semibold">
              {isSignUp ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Crear una'}
            </button>
          </form>
        )}
      </div>

      <div className="text-center pt-4 border-t border-gray-100 text-[10px] text-gray-400 space-y-1">
        <p className="font-bold">Suministros SOS v2.1.0 (Producción)</p>
        <p>Diseñado para emergencias humanitarias bajo redes de baja conectividad.</p>
        <p>Caracas, Venezuela — 2026</p>
        <p className="pt-2 text-[9px] text-gray-500 font-semibold italic animate-fadeIn">
          Esta aplicación está siendo financiada por Repuestos Sotomayor
        </p>
        <p className="text-[9px] text-gray-400 font-medium">
          Para contactarte con el programador de la aplicación escribe al{' '}
          <a
            href="https://wa.me/584128824608?text=Hola%2C%20te%20escribo%20desde%20la%20app%20Suministros%20SOS"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-600 hover:underline font-bold"
          >
            04128824608
          </a>
        </p>
      </div>

      {showAdminPanel && isAdmin && (
        <TabAdmin
          centros={centros}
          onClose={() => setShowAdminPanel(false)}
          refetch={refetch}
        />
      )}
    </div>
  );
}
