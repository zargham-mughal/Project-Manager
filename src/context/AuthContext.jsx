import { createContext, useContext, useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(null);
    const [userRole, setUserRole] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (user) => {
            if (user) {
                setCurrentUser(user);
                try {
                    const snap = await getDoc(doc(db, 'users', user.uid));
                    setUserRole(snap.exists() ? snap.data().role : null);
                } catch {
                    setUserRole(null);
                }
            } else {
                setCurrentUser(null);
                setUserRole(null);
            }
            setAuthLoading(false);
        });
        return unsub;
    }, []);

    return (
        <AuthContext.Provider value={{ currentUser, userRole, authLoading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
