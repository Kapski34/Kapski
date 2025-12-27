import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
    onAuthStateChanged, 
    User, 
    signInWithPopup, 
    GoogleAuthProvider,
    signOut,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword
} from 'firebase/auth';
import { doc, onSnapshot, setDoc, getDoc, updateDoc, increment } from 'firebase/firestore';
import { auth, db, googleProvider } from '../firebaseConfig';

interface UserData {
    tokens: number;
    email: string;
}

interface AuthContextType {
    user: User | null;
    userData: UserData | null;
    loading: boolean;
    loginWithGoogle: () => Promise<void>;
    loginWithEmail: (e: string, p: string) => Promise<void>;
    registerWithEmail: (e: string, p: string) => Promise<void>;
    logout: () => Promise<void>;
    deductToken: (amount?: number) => Promise<boolean>;
    buyTokens: (amount: number) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [userData, setUserData] = useState<UserData | null>(null);
    const [loading, setLoading] = useState(true);
    const [isMockUser, setIsMockUser] = useState(false);

    useEffect(() => {
        if (!auth) {
            setLoading(false);
            return;
        }

        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (isMockUser) return; // Don't override mock user with null

            setUser(currentUser);
            if (currentUser && db) {
                const userRef = doc(db, 'users', currentUser.uid);
                
                // Real-time listener for tokens
                const unsubDoc = onSnapshot(userRef, async (docSnap) => {
                    if (docSnap.exists()) {
                        setUserData(docSnap.data() as UserData);
                    } else {
                        // Create new user doc with 5 free tokens
                        const initialData = {
                            email: currentUser.email || '',
                            tokens: 5, // Free starter tokens
                            createdAt: new Date()
                        };
                        await setDoc(userRef, initialData);
                        setUserData(initialData as UserData);
                    }
                });
                
                return () => unsubDoc();
            } else {
                setUserData(null);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, [isMockUser]);

    const loginWithGoogle = async () => {
        if(!auth || !googleProvider) throw new Error("Firebase not configured");
        await signInWithPopup(auth, googleProvider);
    };

    const loginWithEmail = async (email: string, pass: string) => {
        // MOCK ADMIN LOGIN DLA TESTÓW
        if (email.trim() === 'admin' && pass.trim() === 'admin') {
             const mockUser = {
                uid: 'mock-admin-uid',
                email: 'admin@local.test',
                displayName: 'Admin (Test)',
                emailVerified: true,
                isAnonymous: false,
                photoURL: null,
                providerData: [],
                metadata: {
                    creationTime: new Date().toISOString(),
                    lastSignInTime: new Date().toISOString(),
                },
                refreshToken: 'mock-token',
                tenantId: null,
                delete: async () => {},
                getIdToken: async () => 'mock-token',
                getIdTokenResult: async () => ({
                    token: 'mock-token',
                    expirationTime: '',
                    authTime: '',
                    issuedAtTime: '',
                    signInProvider: 'custom',
                    signInSecondFactor: null,
                    claims: {}
                }),
                reload: async () => {},
                toJSON: () => ({}),
                phoneNumber: null,
                providerId: 'custom'
            } as unknown as User;
            
            setUser(mockUser);
            setUserData({ tokens: 1000, email: 'admin@local.test' });
            setIsMockUser(true);
            return;
        }

        if(!auth) throw new Error("Firebase not configured");
        await signInWithEmailAndPassword(auth, email, pass);
    };

    const registerWithEmail = async (email: string, pass: string) => {
        if(!auth) throw new Error("Firebase not configured");
        await createUserWithEmailAndPassword(auth, email, pass);
    };

    const logout = async () => {
        if (isMockUser) {
            setUser(null);
            setUserData(null);
            setIsMockUser(false);
            return;
        }

        if(!auth) return;
        await signOut(auth);
    };

    const deductToken = async (amount = 1): Promise<boolean> => {
        // Obsługa dla Mock Usera (lokalny stan)
        if (isMockUser && userData) {
             if (userData.tokens < amount) return false;
             setUserData({ ...userData, tokens: userData.tokens - amount });
             return true;
        }

        if (!user || !db || !userData) return false;
        if (userData.tokens < amount) return false;

        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, {
            tokens: increment(-amount)
        });
        return true;
    };
    
    const buyTokens = async (amount: number) => {
        // Obsługa dla Mock Usera (lokalny stan)
        if (isMockUser && userData) {
            setUserData({ ...userData, tokens: userData.tokens + amount });
            return;
        }

        if (!user || !db) return;
        const userRef = doc(db, 'users', user.uid);
        // Simulate payment success
        await updateDoc(userRef, {
            tokens: increment(amount)
        });
    }

    return (
        <AuthContext.Provider value={{ user, userData, loading, loginWithGoogle, loginWithEmail, registerWithEmail, logout, deductToken, buyTokens }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};