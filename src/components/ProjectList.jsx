import './ProjectList.css';
import { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import {
    collection, addDoc, getDocs, deleteDoc, doc, updateDoc,
    query, orderBy, serverTimestamp, where, getDoc
} from 'firebase/firestore';
import { Link } from 'react-router-dom';
import Layout from './Layout';
import { EmptyState, Loader, StatusBadge } from './ui';
import { useAuth } from '../context/AuthContext';
import { syncSprintStatus } from './reportData';
import SearchableDropdown from './SearchableDropdown';

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

const EditProjectModal = ({ project, onSave, onCancel, saving }) => {
    const [form, setForm] = useState({
        name: project.name,
        description: project.description || '',
        budget: project.budget || '',
        startDate: project.startDate || '',
        endDate: project.endDate || '',
    });

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
            <div className="card card-body" style={{ maxWidth: 480, width: '90%' }}>
                <h3 className="card-title mb-16">Edit Project</h3>
                <div className="form-group">
                    <label className="label">Name</label>
                    <input className="input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div className="form-group">
                    <label className="label">Description</label>
                    <textarea className="textarea" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
                </div>
                <div className="form-group">
                    <label className="label">Budget ($)</label>
                    <input className="input" type="number" value={form.budget} onChange={e => setForm(p => ({ ...p, budget: e.target.value }))} min="0" step="0.01" />
                </div>
                <div className="form-row">
                    <div className="form-group">
                        <label className="label">Start Date</label>
                        <input className="input" type="date" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} />
                    </div>
                    <div className="form-group">
                        <label className="label">End Date</label>
                        <input className="input" type="date" value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))} />
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
                    <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
                    <button className="btn btn-primary" disabled={saving} onClick={() => onSave(form)}>{saving ? 'Saving…' : 'Save'}</button>
                </div>
            </div>
        </div>
    );
};

const ProjectList = () => {
    const { userRole } = useAuth();
    const isOrg = userRole === 'org';
    const [projects, setProjects] = useState([]);
    const [spentMap, setSpentMap] = useState({});
    const [projectStatusMap, setProjectStatusMap] = useState({});
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [budget, setBudget] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [error, setError] = useState('');
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [editProject, setEditProject] = useState(null);
    const [saving, setSaving] = useState(false);
    const [creating, setCreating] = useState(false);
    const [orgId, setOrgId] = useState(null);
    const [projectSearch, setProjectSearch] = useState('');
    const user = auth.currentUser;

    const getOrgId = async () => {
        if (isOrg) return user.uid;
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        return userDoc.exists() ? userDoc.data().createdBy : null;
    };

    const fetchProjects = async (oid) => {
        const projectsRef = collection(db, 'organizations', oid, 'projects');
        const q = query(projectsRef, orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setProjects(list);
        return list;
    };

    const computeSpentMap = async (oid, projectList) => {
        const usersSnap = await getDocs(
            query(collection(db, 'users'), where('createdBy', '==', oid))
        );
        const rateMap = {};
        usersSnap.docs.forEach(d => { rateMap[d.id] = d.data().hourlyRate || 0; });

        const map = {};
        const statusMap = {};
        for (const p of projectList) {
            const sprintsSnap = await getDocs(
                collection(db, 'organizations', oid, 'projects', p.id, 'sprints')
            );
            let total = 0;
            const sprintStatuses = [];
            for (const sprintDoc of sprintsSnap.docs) {
                const tasksSnap = await getDocs(
                    collection(db, 'organizations', oid, 'projects', p.id, 'sprints', sprintDoc.id, 'tasks')
                );
                const tasks = tasksSnap.docs.map(d => d.data());
                tasks.forEach(data => {
                    const rate = rateMap[data.assignedTo?.uid] || 0;
                    total += (data.actualHours || 0) * rate;
                });

                // Compute correct sprint status from tasks
                let sprintStatus = 'planned';
                if (tasks.length > 0) {
                    const allDone = tasks.every(t => t.status === 'done');
                    const anyStarted = tasks.some(t => t.status === 'in-progress' || t.status === 'done');
                    if (allDone) sprintStatus = 'completed';
                    else if (anyStarted) sprintStatus = 'active';
                }
                sprintStatuses.push(sprintStatus);
                // Sync sprint status in Firestore if stale
                if (sprintDoc.data().status !== sprintStatus) {
                    syncSprintStatus(oid, p.id, sprintDoc.id);
                }
            }

            // Compute project status from sprint statuses
            let projectStatus = 'planned';
            if (sprintStatuses.length > 0) {
                const allCompleted = sprintStatuses.every(s => s === 'completed');
                const anyActive = sprintStatuses.some(s => s === 'active' || s === 'completed');
                if (allCompleted) projectStatus = 'completed';
                else if (anyActive) projectStatus = 'active';
            }
            statusMap[p.id] = projectStatus;

            map[p.id] = parseFloat(total.toFixed(2));
        }
        setSpentMap(map);
        setProjectStatusMap(statusMap);
    };

    const loadAll = async () => {
        const oid = await getOrgId();
        if (!oid) { setLoading(false); return; }
        setOrgId(oid);
        const list = await fetchProjects(oid);
        await computeSpentMap(oid, list);
        setLoading(false);
    };

    useEffect(() => { loadAll(); }, []);

    const handleCreateProject = async (e) => {
        e.preventDefault();
        setError('');
        if (!name || !budget || !startDate || !endDate) { setError('Please fill in all required fields.'); return; }
        setCreating(true);
        try {
            await addDoc(collection(db, 'organizations', orgId, 'projects'), {
                name, description, budget: parseFloat(budget), spent: 0,
                startDate, endDate, createdAt: serverTimestamp(),
            });
            setName(''); setDescription(''); setBudget(''); setStartDate(''); setEndDate('');
            setShowForm(false);
            loadAll();
        } catch (err) { setError(err.message); }
        finally { setCreating(false); }
    };

    const handleSaveProject = async (form) => {
        setSaving(true);
        try {
            await updateDoc(doc(db, 'organizations', orgId, 'projects', editProject.id), {
                name: form.name,
                description: form.description || '',
                budget: parseFloat(form.budget) || 0,
                startDate: form.startDate,
                endDate: form.endDate,
            });
            setEditProject(null);
            loadAll();
        } catch (err) { setError(err.message); }
        finally { setSaving(false); }
    };

    const handleDeleteProject = async () => {
        if (!confirmDelete) return;
        try {
            const sprintsSnap = await getDocs(
                collection(db, 'organizations', orgId, 'projects', confirmDelete.id, 'sprints')
            );
            for (const s of sprintsSnap.docs) {
                const tasksSnap = await getDocs(
                    collection(db, 'organizations', orgId, 'projects', confirmDelete.id, 'sprints', s.id, 'tasks')
                );
                for (const t of tasksSnap.docs) await deleteDoc(t.ref);
                await deleteDoc(s.ref);
            }
            await deleteDoc(doc(db, 'organizations', orgId, 'projects', confirmDelete.id));
            setConfirmDelete(null);
            loadAll();
        } catch (err) {
            setError(err.message);
            setConfirmDelete(null);
        }
    };

    const dashboardPath = isOrg ? '/orghome' : '/userhome';

    return (
        <Layout role={userRole || 'org'} crumbs={[{ label: 'Dashboard', to: dashboardPath }, { label: 'Projects' }]}>
            {confirmDelete && (
                <ConfirmDialog
                    message={`Delete project "${confirmDelete.name}"? All sprints and tasks inside will be permanently deleted.`}
                    onConfirm={handleDeleteProject}
                    onCancel={() => setConfirmDelete(null)}
                />
            )}

            {editProject && (
                <EditProjectModal
                    project={editProject}
                    onSave={handleSaveProject}
                    onCancel={() => setEditProject(null)}
                    saving={saving}
                />
            )}

            <div className="page-header">
                <div>
                    <h1 className="page-title">Projects</h1>
                    <p className="page-subtitle">{projects.length} project{projects.length !== 1 ? 's' : ''} in your workspace</p>
                </div>
                {isOrg && (
                    <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
                        {showForm ? 'Cancel' : '+ New Project'}
                    </button>
                )}
            </div>

            <div className="searchable-select mb-24" style={{ maxWidth: '100%' }}>
                <div className="searchable-select-input-wrap">
                    <span className="searchable-select-icon">🔍</span>
                    <input
                        className="input searchable-select-input"
                        type="text"
                        placeholder="Search projects…"
                        value={projectSearch}
                        onKeyDown={e => { if (/[0-9]/.test(e.key)) e.preventDefault(); }}
                        onChange={e => setProjectSearch(e.target.value.replace(/[0-9]/g, ''))}
                    />
                </div>
            </div>

            {showForm && (
                <div className="card card-body mb-24">
                    <h3 className="card-title mb-16">Create a new project</h3>
                    <form onSubmit={handleCreateProject}>
                        <div className="form-group">
                            <label className="label">Project name *</label>
                            <input className="input" type="text" value={name} onChange={e => setName(e.target.value)} required />
                        </div>
                        <div className="form-group">
                            <label className="label">Description</label>
                            <textarea className="textarea" value={description} onChange={e => setDescription(e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label className="label">Budget ($) *</label>
                            <input className="input" type="number" value={budget} onChange={e => setBudget(e.target.value)} min="0" step="0.01" required />
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label className="label">Start date *</label>
                                <input className="input" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
                            </div>
                            <div className="form-group">
                                <label className="label">End date *</label>
                                <input className="input" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} required />
                            </div>
                        </div>
                        {error && <div className="alert alert-error">{error}</div>}
                        <button type="submit" className="btn btn-success" disabled={creating}>
                            {creating ? 'Creating…' : 'Create Project'}
                        </button>
                    </form>
                </div>
            )}

            {loading ? (
                <Loader />
            ) : projects.length === 0 ? (
                <EmptyState icon="📁" title="No projects yet">
                    {isOrg ? 'Create your first project to get started.' : 'No projects in your organization yet.'}
                </EmptyState>
            ) : (() => {
                const searchFiltered = projects.filter(p => !projectSearch || p.name.toLowerCase().includes(projectSearch.toLowerCase()));
                const planned = searchFiltered.filter(p => (projectStatusMap[p.id] || 'planned') === 'planned');
                const active = searchFiltered.filter(p => projectStatusMap[p.id] === 'active');
                const completed = searchFiltered.filter(p => projectStatusMap[p.id] === 'completed');

                const ProjectCard = ({ p }) => {
                    const spent = spentMap[p.id] ?? 0;
                    const pct = p.budget > 0 ? Math.min(100, (spent / p.budget) * 100) : 0;
                    return (
                        <div className="task-card" style={{ position: 'relative' }}>
                            {isOrg && (
                                <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4 }}>
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => setEditProject(p)}
                                        title="Edit"
                                    >✏️</button>
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        style={{ color: 'var(--danger, #de350b)' }}
                                        onClick={() => setConfirmDelete({ id: p.id, name: p.name })}
                                        title="Delete"
                                    >🗑</button>
                                </div>
                            )}
                            <Link to={`/projects/${p.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                                <div className="task-title" style={{ paddingRight: isOrg ? 60 : 0 }}>{p.name}</div>
                                {p.description && <div className="task-desc">{p.description}</div>}
                                <div className="task-meta">
                                    <span>📅 {p.startDate} → {p.endDate}</span>
                                </div>
                                <div className="row-between text-sm" style={{ marginBottom: 6, marginTop: 8 }}>
                                    <span className="text-muted">Budget</span>
                                    <span style={{ fontWeight: 600 }}>
                                        ${spent.toFixed(2)} / ${p.budget?.toLocaleString()}
                                    </span>
                                </div>
                                <div className="progress">
                                    <div className={`progress-bar ${pct > 90 ? 'danger' : pct > 70 ? 'warning' : ''}`} style={{ width: `${pct}%` }} />
                                </div>
                            </Link>
                        </div>
                    );
                };

                return (
                    <div className="board">
                        <div className="board-col">
                            <div className="board-col-header">Planned <span className="count">{planned.length}</span></div>
                            <div className="board-col-body">
                                {planned.length === 0 ? <div className="board-col-empty">No projects</div> : planned.map(p => <ProjectCard key={p.id} p={p} />)}
                            </div>
                        </div>
                        <div className="board-col">
                            <div className="board-col-header">Active <span className="count">{active.length}</span></div>
                            <div className="board-col-body">
                                {active.length === 0 ? <div className="board-col-empty">No projects</div> : active.map(p => <ProjectCard key={p.id} p={p} />)}
                            </div>
                        </div>
                        <div className="board-col">
                            <div className="board-col-header">Completed <span className="count">{completed.length}</span></div>
                            <div className="board-col-body">
                                {completed.length === 0 ? <div className="board-col-empty">No projects</div> : completed.map(p => <ProjectCard key={p.id} p={p} />)}
                            </div>
                        </div>
                    </div>
                );
            })()}
        </Layout>
    );
};

export default ProjectList;
