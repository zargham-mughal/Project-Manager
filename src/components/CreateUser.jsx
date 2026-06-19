import { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, deleteDoc, collection, query, where, getDocs } from 'firebase/firestore';
import Layout from './Layout';
import { Avatar, EmptyState } from './ui';
import './CreateUser.css';

const getSecondaryAuth = () => {
    const secondaryAppName = 'Secondary';
    const existing = getApps().find(app => app.name === secondaryAppName);
    if (existing) return getAuth(existing);
    const primaryApp = getApps().find(app => app.name === '[DEFAULT]');
    const secondaryApp = initializeApp(primaryApp.options, secondaryAppName);
    return getAuth(secondaryApp);
};

const calcShiftHours = (startTime, endTime) => {
    if (!startTime || !endTime) return 8;
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const diff = (eh * 60 + em) - (sh * 60 + sm);
    return diff > 0 ? parseFloat((diff / 60).toFixed(2)) : 8;
};

const ConfirmDialog = ({ message, onConfirm, onCancel }) => (
    <div style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
        <div className="card card-body" style={{ maxWidth: 380, width: '90%' }}>
            <p style={{ marginBottom: 20, fontWeight: 500 }}>{message}</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
                <button className="btn btn-danger" onClick={onConfirm}>Delete</button>
            </div>
        </div>
    </div>
);

const CreateUser = () => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [hourlyRate, setHourlyRate] = useState('');
    const [startTime, setStartTime] = useState('09:00');
    const [endTime, setEndTime] = useState('17:00');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [users, setUsers] = useState([]);
    const [creating, setCreating] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [teamSearch, setTeamSearch] = useState('');
    const filteredUsers = users.filter(u => {
        if (!teamSearch) return true;
        const term = teamSearch.toLowerCase();
        return (u.name || '').toLowerCase().includes(term) || (u.email || '').toLowerCase().includes(term);
    });
    const orgUser = auth.currentUser;

    const fetchUsers = async () => {
        if (!orgUser) return;
        const q = query(collection(db, 'users'), where('createdBy', '==', orgUser.uid));
        const snapshot = await getDocs(q);
        setUsers(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    };

    useEffect(() => { fetchUsers(); }, []);

    const handleCreateUser = async (e) => {
        e.preventDefault();
        setMessage(''); setError(''); setCreating(true);
        try {
            const secondaryAuth = getSecondaryAuth();
            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
            const newUser = userCredential.user;
            await secondaryAuth.signOut();
            const shiftHours = calcShiftHours(startTime, endTime);
            await setDoc(doc(db, 'users', newUser.uid), {
                name, email: newUser.email, role: 'user',
                createdBy: orgUser.uid,
                hourlyRate: parseFloat(hourlyRate) || 0,
                startTime, endTime,
                shiftHours,
                createdAt: new Date(),
            });
            setMessage(`User ${email} created successfully!`);
            setName(''); setEmail(''); setPassword('');
            setHourlyRate(''); setStartTime('09:00'); setEndTime('17:00');
            fetchUsers();
        } catch (err) {
            setError(err.code === 'auth/email-already-in-use' ? 'This email is already registered.' : err.message);
        } finally {
            setCreating(false);
        }
    };

    const handleDeleteUser = async () => {
        if (!confirmDelete) return;
        try {
            await deleteDoc(doc(db, 'users', confirmDelete.id));
            setConfirmDelete(null);
            fetchUsers();
        } catch (err) {
            setError(err.message);
            setConfirmDelete(null);
        }
    };

    return (
        <Layout role="org" crumbs={[{ label: 'Dashboard', to: '/orghome' }, { label: 'Team' }]}>
            {confirmDelete && (
                <ConfirmDialog
                    message={`Delete "${confirmDelete.name}"? This only removes their profile — their Firebase Auth account remains.`}
                    onConfirm={handleDeleteUser}
                    onCancel={() => setConfirmDelete(null)}
                />
            )}

            <div className="page-header">
                <div>
                    <h1 className="page-title">Team</h1>
                    <p className="page-subtitle">{users.length} member{users.length !== 1 ? 's' : ''} in your organization</p>
                </div>
            </div>

            <div className="create-user-layout">
                <div className="card card-body">
                    <h3 className="card-title mb-16">Add a team member</h3>
                    <form onSubmit={handleCreateUser}>
                        <div className="form-group">
                            <label className="label">Full name *</label>
                            <input className="input" type="text" value={name} onChange={e => setName(e.target.value)} required />
                        </div>
                        <div className="form-group">
                            <label className="label">Email *</label>
                            <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
                        </div>
                        <div className="form-group">
                            <label className="label">Temporary password *</label>
                            <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
                        </div>
                        <div className="form-group">
                            <label className="label">Hourly rate ($/hr) *</label>
                            <input className="input" type="number" value={hourlyRate} onChange={e => setHourlyRate(e.target.value)} min="0" step="0.01" required placeholder="e.g. 25.00" />
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label className="label">Start time *</label>
                                <input className="input" type="time" value={startTime} onChange={e => setStartTime(e.target.value)} required />
                            </div>
                            <div className="form-group">
                                <label className="label">End time *</label>
                                <input className="input" type="time" value={endTime} onChange={e => setEndTime(e.target.value)} required />
                            </div>
                        </div>
                        <div className="rate-info">
                            <span>💡 Work hours: {calcShiftHours(startTime, endTime)}h/day — Budget = actual hours × hourly rate</span>
                        </div>
                        {message && <div className="alert alert-success" style={{ marginTop: 12 }}>{message}</div>}
                        {error && <div className="alert alert-error">{error}</div>}
                        <button type="submit" className="btn btn-success btn-block" style={{ marginTop: 16 }} disabled={creating}>
                            {creating ? 'Creating…' : 'Create User'}
                        </button>
                    </form>
                </div>

                <div>
                    <h3 className="section-title">Your team</h3>
                    {users.length === 0 ? (
                        <EmptyState icon="👥" title="No team members yet">Add your first user with the form.</EmptyState>
                    ) : (
                        <>
                        <div className="searchable-select mb-16" style={{ maxWidth: '100%' }}>
                            <div className="searchable-select-input-wrap">
                                <span className="searchable-select-icon">🔍</span>
                                <input
                                    className="input searchable-select-input"
                                    type="text"
                                    placeholder="Search team members…"
                                    value={teamSearch}
                                    onKeyDown={e => { if (/[0-9]/.test(e.key)) e.preventDefault(); }}
                                    onChange={e => setTeamSearch(e.target.value.replace(/[0-9]/g, ''))}
                                />
                            </div>
                        </div>
                        <div className="table-wrap">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Member</th>
                                        <th>Email</th>
                                        <th>Rate</th>
                                        <th>Schedule</th>
                                        <th>Joined</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredUsers.map(u => (
                                        <tr key={u.id}>
                                            <td>
                                                <span className="assignee">
                                                    <Avatar name={u.name} email={u.email} />
                                                    <span className="name" style={{ fontWeight: 600 }}>{u.name || 'N/A'}</span>
                                                </span>
                                            </td>
                                            <td className="text-muted">{u.email}</td>
                                            <td>${u.hourlyRate || 0}/hr</td>
                                            <td>
                                                {u.startTime && u.endTime
                                                    ? `${u.startTime} – ${u.endTime}`
                                                    : `${u.shiftHours || 8}h/day`}
                                            </td>
                                            <td className="text-muted">
                                                {u.createdAt?.toDate ? u.createdAt.toDate().toLocaleDateString() : 'N/A'}
                                            </td>
                                            <td>
                                                <button
                                                    className="btn btn-ghost btn-sm"
                                                    style={{ color: 'var(--danger, #de350b)' }}
                                                    onClick={() => setConfirmDelete({ id: u.id, name: u.name || u.email })}
                                                >
                                                    🗑 Delete
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        </>
                    )}
                </div>
            </div>
        </Layout>
    );
};

export default CreateUser;
