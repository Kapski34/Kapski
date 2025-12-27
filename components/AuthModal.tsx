import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
    const { loginWithGoogle, loginWithEmail, registerWithEmail } = useAuth();
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            if (isLogin) {
                await loginWithEmail(email, password);
            } else {
                await registerWithEmail(email, password);
            }
            onClose();
        } catch (err: any) {
            setError(err.message || 'Wystąpił błąd');
        } finally {
            setLoading(false);
        }
    };

    const handleGoogle = async () => {
        setError(null);
        try {
            await loginWithGoogle();
            onClose();
        } catch (err: any) {
            setError(err.message || 'Błąd logowania Google');
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-slate-900 border border-cyan-500/30 rounded-2xl w-full max-w-md p-8 shadow-2xl relative" onClick={e => e.stopPropagation()}>
                <h2 className="text-2xl font-bold text-white mb-6 text-center">
                    {isLogin ? 'Zaloguj się' : 'Utwórz konto'}
                </h2>
                
                {error && <div className="mb-4 p-3 bg-red-900/50 border border-red-800 text-red-200 text-sm rounded">{error}</div>}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Email / Login</label>
                        <input 
                            type="text" 
                            required 
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-cyan-500 outline-none"
                            placeholder="np. admin"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Hasło</label>
                        <input 
                            type="password" 
                            required 
                            minLength={4}
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-cyan-500 outline-none"
                            placeholder="np. admin"
                        />
                    </div>
                    
                    <button 
                        type="submit" 
                        disabled={loading}
                        className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg transition-all shadow-lg shadow-cyan-500/20"
                    >
                        {loading ? 'Przetwarzanie...' : (isLogin ? 'Zaloguj się' : 'Zarejestruj się')}
                    </button>
                </form>

                <div className="my-6 flex items-center gap-4">
                    <div className="h-px bg-gray-700 flex-1"></div>
                    <span className="text-gray-500 text-sm">LUB</span>
                    <div className="h-px bg-gray-700 flex-1"></div>
                </div>

                <button 
                    onClick={handleGoogle}
                    type="button"
                    className="w-full py-3 bg-white hover:bg-gray-100 text-gray-900 font-bold rounded-lg transition-all flex items-center justify-center gap-2"
                >
                    <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z" /><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
                    Kontynuuj z Google
                </button>

                <p className="mt-6 text-center text-sm text-gray-400">
                    {isLogin ? "Nie masz konta?" : "Masz już konto?"} 
                    <button onClick={() => setIsLogin(!isLogin)} className="ml-2 text-cyan-400 hover:text-cyan-300 font-bold">
                        {isLogin ? "Zarejestruj się" : "Zaloguj się"}
                    </button>
                </p>
                
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white">✕</button>
            </div>
        </div>
    );
};