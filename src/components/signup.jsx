import './Auth.css';
import { useState } from 'react';
import { auth, db } from '../firebase';
import { createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { Link, useNavigate } from 'react-router-dom';

const Signup = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const saveOrgToFirestore = async (user) => {
        await setDoc(doc(db, 'users', user.uid), {
            email: user.email,
            role: 'org',
            createdAt: new Date(),
        });
    };

    const handleSignup = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            await saveOrgToFirestore(userCredential.user);
            navigate('/orghome');
        } catch (err) {
            setError(err.message);
            setLoading(false);
        }
    };

    const handleGoogleSignup = async () => {
        const provider = new GoogleAuthProvider();
        setError('');
        try {
            const userCredential = await signInWithPopup(auth, provider);
            await saveOrgToFirestore(userCredential.user);
            navigate('/orghome');
        } catch (err) {
            setError(err.message);
        }
    };

    return (
        <div className="auth-page">
            <div className="auth-card">
                <div className="auth-brand">
                    <span className="logo-mark">✓</span>
                    <span>TaskFlow</span>
                </div>
                <h1 className="auth-title">Create your workspace</h1>
                <p className="auth-subtitle">Register your organization to start planning sprints.</p>

                <form onSubmit={handleSignup}>
                    <div className="form-group">
                        <label className="label">Work email</label>
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
                            placeholder="Create a strong password"
                            required
                        />
                    </div>

                    {error && <div className="alert alert-error">{error}</div>}

                    <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
                        {loading ? 'Creating…' : 'Create organization'}
                    </button>
                </form>

                <div className="auth-divider">or</div>

                <button onClick={handleGoogleSignup} className="btn btn-google btn-block">
                    <span style={{ fontWeight: 700, color: '#4285f4' }}>G</span> Sign up with Google
                </button>

                <div className="auth-footer">
                    Already have an account? <Link to="/">Sign in</Link>
                </div>
            </div>
        </div>
    );
};

export default Signup;
