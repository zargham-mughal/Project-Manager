import './Auth.css';
import { useState } from 'react';
import { auth, db } from '../firebase';
import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { Link, useNavigate } from 'react-router-dom';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const routeByRole = async (user) => {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (!userDoc.exists()) {
            setError('Account not found in database.');
            setLoading(false);
            return;
        }
        const role = userDoc.data().role;
        if (role === 'org') navigate('/orghome');
        else if (role === 'user') navigate('/userhome');
        else { setError('Unknown role. Please contact support.'); setLoading(false); }
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            setEmail('');
            setPassword('');
            await routeByRole(userCredential.user);
        } catch (err) {
            if (err.code === 'auth/invalid-credential') {
                setError('Invalid email or password.');
            } else {
                setError('An error occurred. Please try again.');
            }
            setLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        const provider = new GoogleAuthProvider();
        setError('');
        setLoading(true);
        try {
            const userCredential = await signInWithPopup(auth, provider);
            await routeByRole(userCredential.user);
        } catch (err) {
            setError(err.message);
            setLoading(false);
        }
    };

    return (
        <div className="auth-page">
            <div className="auth-card">
                <div className="auth-brand">
                    <span className="logo-mark">✓</span>
                    <span>TaskFlow</span>
                </div>
                <h1 className="auth-title">Welcome back</h1>
                <p className="auth-subtitle">Sign in to manage your projects and tasks.</p>

                <form onSubmit={handleLogin}>
                    <div className="form-group">
                        <label className="label">Email</label>
                        <input
                            className="input"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@company.com"
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label className="label">Password</label>
                        <input
                            className="input"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    {error && <div className="alert alert-error">{error}</div>}

                    <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
                        {loading ? 'Signing in…' : 'Sign in'}
                    </button>
                </form>

                <div className="auth-divider">or</div>

                <button onClick={handleGoogleLogin} className="btn btn-google btn-block" disabled={loading}>
                    <svg width="18" height="18" viewBox="0 0 48 48">
                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                    </svg>
                    Sign in with Google
                </button>

                <div className="auth-footer">
                    New organization? <Link to="/signup">Create an account</Link>
                </div>
            </div>
        </div>
    );
};

export default Login;
