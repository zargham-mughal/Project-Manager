import { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import {
    doc, getDoc, collection, addDoc, getDocs, deleteDoc, updateDoc,
    query, orderBy, serverTimestamp, where
} from 'firebase/firestore';
import { Link, useParams, useNavigate } from 'react-router-dom';
import Layout from './Layout';
import { EmptyState, Loader, StatusBadge } from './ui';
import { useAuth } from '../context/AuthContext';
import { syncSprintStatus } from './reportData';
import './ProjectDetail.css';
import './SprintDetail.css';

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

const EditModal = ({ title, fields, values, onSave, onCancel, saving }) => {
    const [form, setForm] = useState({ ...values });
    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
            <div className="card card-body" style={{ maxWidth: 480, width: '90%' }}>
                <h3 className="card-title mb-16">{title}</h3>
                {fields.map(f => (
                    <div className="form-group" key={f.key}>
                        <label className="label">{f.label}</label>
                        {f.type === 'textarea' ? (
                            <textarea className="textarea" value={form[f.key] || ''} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} />
                        ) : f.type === 'select' ? (
                            <select className="select" value={form[f.key] || ''} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}>
                                {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                        ) : (
                            <input className="input" type={f.type || 'text'} value={form[f.key] || ''} onChange={e => setForm(prev => ({ ...prev, [f.key]: f.type === 'number' ? e.target.value : e.target.value }))} min={f.min} step={f.step} />
                        )}
                    </div>
                ))}
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
                    <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
                    <button className="btn btn-primary" disabled={saving} onClick={() => onSave(form)}>{saving ? 'Saving…' : 'Save'}</button>
                </div>
            </div>
        </div>
    );
};

const BoardTaskCard = ({ t, orgId, projectId, sprintId, onRefresh, isOrg }) => {
    const isClockedIn = !!t.clockedInAt;
    const taskRef = doc(db, 'organizations', orgId, 'projects', projectId, 'sprints', sprintId, 'tasks', t.id);

    const handleClockIn = async () => {
        await updateDoc(taskRef, { clockedInAt: new Date().toISOString(), status: 'in-progress' });
        await syncSprintStatus(orgId, projectId, sprintId);
        if (onRefresh) onRefresh();
    };
    const handleClockOut = async () => {
        if (!t.clockedInAt) return;
        const start = new Date(t.clockedInAt);
        const hoursWorked = parseFloat(((new Date() - start) / (1000 * 60 * 60)).toFixed(2));
        const newActual = (t.actualHours || 0) + hoursWorked;
        await updateDoc(taskRef, { actualHours: parseFloat(newActual.toFixed(2)), clockedInAt: null });
        if (onRefresh) onRefresh();
    };

    return (
        <div className="task-card">
            <div className="task-title">{t.title}</div>
            {t.description && <div className="task-desc">{t.description}</div>}
            <div className="task-meta">
                <span>⏱ {t.actualHours || 0}/{t.estimatedHours}h</span>
                {t.dueDate && <span>📅 {t.dueDate}</span>}
            </div>
            {t.status !== 'done' && (
                <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {isClockedIn ? (
                        <button className="btn btn-danger btn-sm" disabled={isOrg} onClick={handleClockOut}>⏹ Clock Out</button>
                    ) : (
                        <button className="btn btn-success btn-sm" disabled={isOrg} onClick={handleClockIn}>▶ Clock In</button>
                    )}
                    {isClockedIn && <span className="text-sm" style={{ color: 'var(--success)', fontWeight: 600 }}>🟢 Working…</span>}
                </div>
            )}
        </div>
    );
};

const SprintAccordion = ({ sprint, projectId, onDelete, onEdit, isOrg, orgId }) => {
    const [open, setOpen] = useState(false);
    const [tasks, setTasks] = useState([]);
    const [loaded, setLoaded] = useState(false);

    const reloadTasks = async () => {
        const tasksRef = collection(db, 'organizations', orgId, 'projects', projectId, 'sprints', sprint.id, 'tasks');
        const snap = await getDocs(tasksRef);
        setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    };

    const handleToggle = async () => {
        if (!open && !loaded) {
            await reloadTasks();
            setLoaded(true);
            syncSprintStatus(orgId, projectId, sprint.id);
        }
        setOpen(o => !o);
    };

    const todoTasks = tasks.filter(t => t.status === 'todo');
    const inProgressTasks = tasks.filter(t => t.status === 'in-progress');
    const doneTasks = tasks.filter(t => t.status === 'done');
    const pct = tasks.length > 0 ? (doneTasks.length / tasks.length) * 100 : 0;

    return (
        <div className="sprint-accordion">
            <button className="sprint-accordion-header" onClick={handleToggle}>
                <div className="sprint-accordion-left">
                    <span className={`sprint-chevron ${open ? 'open' : ''}`}>▶</span>
                    <div>
                        <div className="sprint-name">{sprint.name}</div>
                        <div className="sprint-dates text-sm text-muted">{sprint.startDate} → {sprint.endDate}</div>
                    </div>
                </div>
                <div className="sprint-accordion-right">
                    <StatusBadge status={sprint.status} />
                    <Link
                        to={`/projects/${projectId}/sprints/${sprint.id}`}
                        className="btn btn-sm btn-primary"
                        onClick={e => e.stopPropagation()}
                    >
                        Open →
                    </Link>
                    {isOrg && (
                        <>
                            <button
                                className="btn btn-ghost btn-sm"
                                onClick={e => { e.stopPropagation(); onEdit(sprint); }}
                                title="Edit sprint"
                            >
                                ✏️
                            </button>
                            <button
                                className="btn btn-ghost btn-sm"
                                style={{ color: 'var(--danger, #de350b)' }}
                                onClick={e => { e.stopPropagation(); onDelete(sprint); }}
                                title="Delete sprint"
                            >
                                🗑
                            </button>
                        </>
                    )}
                </div>
            </button>
            {open && (
                <div className="sprint-accordion-body">
                    {loaded && tasks.length > 0 && (
                        <div className="row-between text-sm mb-16">
                            <span className="text-muted">{tasks.length} tasks · {doneTasks.length} done</span>
                            <div className="sprint-progress-wrap">
                                <div className="progress" style={{ width: 80 }}>
                                    <div className="progress-bar" style={{ width: `${pct}%` }} />
                                </div>
                                <span>{pct.toFixed(0)}%</span>
                            </div>
                        </div>
                    )}
                    {tasks.length === 0 ? (
                        <p className="text-muted text-sm">No tasks in this sprint.</p>
                    ) : (
                        <div className="board">
                            <div className="board-col">
                                <div className="board-col-header">Todo <span className="count">{todoTasks.length}</span></div>
                                <div className="board-col-body">
                                    {todoTasks.length === 0 ? <div className="board-col-empty">No tasks</div> : todoTasks.map(t => (
                                        <BoardTaskCard key={t.id} t={t} orgId={orgId} projectId={projectId} sprintId={sprint.id} onRefresh={reloadTasks} isOrg={isOrg} />
                                    ))}
                                </div>
                            </div>
                            <div className="board-col">
                                <div className="board-col-header">In Progress <span className="count">{inProgressTasks.length}</span></div>
                                <div className="board-col-body">
                                    {inProgressTasks.length === 0 ? <div className="board-col-empty">No tasks</div> : inProgressTasks.map(t => (
                                        <BoardTaskCard key={t.id} t={t} orgId={orgId} projectId={projectId} sprintId={sprint.id} onRefresh={reloadTasks} isOrg={isOrg} />
                                    ))}
                                </div>
                            </div>
                            <div className="board-col">
                                <div className="board-col-header">Done <span className="count">{doneTasks.length}</span></div>
                                <div className="board-col-body">
                                    {doneTasks.length === 0 ? <div className="board-col-empty">No tasks</div> : doneTasks.map(t => (
                                        <BoardTaskCard key={t.id} t={t} orgId={orgId} projectId={projectId} sprintId={sprint.id} onRefresh={reloadTasks} isOrg={isOrg} />
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const ProjectDetail = () => {
    const { projectId } = useParams();
    const navigate = useNavigate();
    const { userRole } = useAuth();
    const isOrg = userRole === 'org';
    const [project, setProject] = useState(null);
    const [sprints, setSprints] = useState([]);
    const [liveSpent, setLiveSpent] = useState(0);
    const [showForm, setShowForm] = useState(false);
    const [name, setName] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [error, setError] = useState('');
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [editProject, setEditProject] = useState(false);
    const [editSprint, setEditSprint] = useState(null);
    const [saving, setSaving] = useState(false);
    const [creating, setCreating] = useState(false);
    const [orgId, setOrgId] = useState(null);

    const user = auth.currentUser;

    const getOrgId = async () => {
        if (isOrg) return user.uid;
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        return userDoc.exists() ? userDoc.data().createdBy : null;
    };

    const projectRef = () => doc(db, 'organizations', orgId, 'projects', projectId);
    const sprintsRef = () => collection(projectRef(), 'sprints');

    const fetchProject = async () => {
        const snap = await getDoc(projectRef());
        if (snap.exists()) setProject({ id: snap.id, ...snap.data() });
    };

    const fetchSprints = async () => {
        const q = query(sprintsRef(), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        setSprints(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    };

    const computeLiveSpent = async () => {
        const usersSnap = await getDocs(
            query(collection(db, 'users'), where('createdBy', '==', orgId))
        );
        const rateMap = {};
        usersSnap.docs.forEach(d => { rateMap[d.id] = d.data().hourlyRate || 0; });

        const sprintsSnap = await getDocs(sprintsRef());
        let total = 0;
        for (const sprintDoc of sprintsSnap.docs) {
            const tasksSnap = await getDocs(
                collection(db, 'organizations', orgId, 'projects', projectId, 'sprints', sprintDoc.id, 'tasks')
            );
            tasksSnap.docs.forEach(t => {
                const data = t.data();
                const rate = rateMap[data.assignedTo?.uid] || 0;
                total += (data.actualHours || 0) * rate;
            });
        }
        setLiveSpent(parseFloat(total.toFixed(2)));
    };

    useEffect(() => {
        const init = async () => {
            const oid = await getOrgId();
            if (!oid) return;
            setOrgId(oid);
        };
        init();
    }, []);

    useEffect(() => {
        if (!orgId) return;
        fetchProject();
        fetchSprints();
        computeLiveSpent();
    }, [orgId]);

    const handleCreateSprint = async (e) => {
        e.preventDefault();
        setError('');
        if (!name || !startDate || !endDate) { setError('Please fill in all fields.'); return; }
        setCreating(true);
        try {
            await addDoc(sprintsRef(), { name, startDate, endDate, status: 'planned', createdAt: serverTimestamp() });
            setName(''); setStartDate(''); setEndDate('');
            setShowForm(false);
            fetchSprints();
        } catch (err) { setError(err.message); }
        finally { setCreating(false); }
    };

    const handleSaveProject = async (form) => {
        setSaving(true);
        try {
            await updateDoc(projectRef(), {
                name: form.name,
                description: form.description || '',
                budget: parseFloat(form.budget) || 0,
                startDate: form.startDate,
                endDate: form.endDate,
            });
            setEditProject(false);
            fetchProject();
        } catch (err) { setError(err.message); }
        finally { setSaving(false); }
    };

    const handleSaveSprint = async (form) => {
        setSaving(true);
        try {
            await updateDoc(doc(sprintsRef(), editSprint.id), {
                name: form.name,
                startDate: form.startDate,
                endDate: form.endDate,
                status: form.status,
            });
            setEditSprint(null);
            fetchSprints();
        } catch (err) { setError(err.message); }
        finally { setSaving(false); }
    };

    const handleConfirmDelete = async () => {
        if (!confirmDelete) return;
        try {
            if (confirmDelete.type === 'sprint') {
                const tasksSnap = await getDocs(
                    collection(db, 'organizations', orgId, 'projects', projectId, 'sprints', confirmDelete.id, 'tasks')
                );
                for (const t of tasksSnap.docs) await deleteDoc(t.ref);
                await deleteDoc(doc(db, 'organizations', orgId, 'projects', projectId, 'sprints', confirmDelete.id));
                setConfirmDelete(null);
                fetchSprints();
                computeLiveSpent();
            } else if (confirmDelete.type === 'project') {
                const sprintsSnap = await getDocs(sprintsRef());
                for (const s of sprintsSnap.docs) {
                    const tasksSnap = await getDocs(
                        collection(db, 'organizations', orgId, 'projects', projectId, 'sprints', s.id, 'tasks')
                    );
                    for (const t of tasksSnap.docs) await deleteDoc(t.ref);
                    await deleteDoc(s.ref);
                }
                await deleteDoc(projectRef());
                setConfirmDelete(null);
                navigate('/projects');
            }
        } catch (err) {
            setError(err.message);
            setConfirmDelete(null);
        }
    };

    const dashboardPath = isOrg ? '/orghome' : '/userhome';

    if (!project) {
        return (
            <Layout role={userRole || 'org'} crumbs={[{ label: 'Projects', to: '/projects' }]}>
                <Loader />
            </Layout>
        );
    }

    const budgetPercent = project.budget > 0 ? Math.min(100, (liveSpent / project.budget) * 100) : 0;
    const remaining = (project.budget || 0) - liveSpent;

    return (
        <Layout role={userRole || 'org'} crumbs={[{ label: 'Projects', to: '/projects' }, { label: project.name }]}>
            {confirmDelete && (
                <ConfirmDialog
                    message={
                        confirmDelete.type === 'project'
                            ? `Delete project "${confirmDelete.name}"? All sprints and tasks will be permanently deleted.`
                            : `Delete sprint "${confirmDelete.name}"? All tasks inside will be permanently deleted.`
                    }
                    onConfirm={handleConfirmDelete}
                    onCancel={() => setConfirmDelete(null)}
                />
            )}

            {editProject && (
                <EditModal
                    title="Edit Project"
                    fields={[
                        { key: 'name', label: 'Name' },
                        { key: 'description', label: 'Description', type: 'textarea' },
                        { key: 'budget', label: 'Budget ($)', type: 'number', min: '0', step: '0.01' },
                        { key: 'startDate', label: 'Start Date', type: 'date' },
                        { key: 'endDate', label: 'End Date', type: 'date' },
                    ]}
                    values={{ name: project.name, description: project.description, budget: project.budget, startDate: project.startDate, endDate: project.endDate }}
                    onSave={handleSaveProject}
                    onCancel={() => setEditProject(false)}
                    saving={saving}
                />
            )}

            {editSprint && (
                <EditModal
                    title="Edit Sprint"
                    fields={[
                        { key: 'name', label: 'Name' },
                        { key: 'startDate', label: 'Start Date', type: 'date' },
                        { key: 'endDate', label: 'End Date', type: 'date' },
                        { key: 'status', label: 'Status', type: 'select', options: ['planned', 'active', 'completed'] },
                    ]}
                    values={{ name: editSprint.name, startDate: editSprint.startDate, endDate: editSprint.endDate, status: editSprint.status }}
                    onSave={handleSaveSprint}
                    onCancel={() => setEditSprint(null)}
                    saving={saving}
                />
            )}

            <div className="page-header">
                <div>
                    <h1 className="page-title">{project.name}</h1>
                    <p className="page-subtitle">{project.startDate} → {project.endDate}</p>
                </div>
                {isOrg && (
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditProject(true)}>✏️ Edit</button>
                        <button
                            className="btn btn-ghost btn-sm"
                            style={{ color: 'var(--danger, #de350b)' }}
                            onClick={() => setConfirmDelete({ type: 'project', id: projectId, name: project.name })}
                        >
                            🗑 Delete Project
                        </button>
                    </div>
                )}
            </div>

            {project.description && <p className="text-muted mb-24">{project.description}</p>}

            <div className="stat-grid">
                <div className="stat-card">
                    <div className="stat-label">Budget</div>
                    <div className="stat-value">${project.budget?.toLocaleString()}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Spent</div>
                    <div className="stat-value danger">${liveSpent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Remaining</div>
                    <div className="stat-value success">${remaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                </div>
            </div>

            <div className="card card-body mb-24">
                <div className="row-between text-sm" style={{ marginBottom: 8 }}>
                    <span className="text-muted">Budget utilization</span>
                    <span style={{ fontWeight: 600 }}>{budgetPercent.toFixed(1)}%</span>
                </div>
                <div className="progress">
                    <div
                        className={`progress-bar ${budgetPercent > 90 ? 'danger' : budgetPercent > 70 ? 'warning' : ''}`}
                        style={{ width: `${budgetPercent}%` }}
                    />
                </div>
            </div>

            <div className="row-between mb-16">
                <h2 className="section-title" style={{ margin: 0 }}>Sprints</h2>
                {isOrg && (
                    <button className="btn btn-primary btn-sm" onClick={() => setShowForm(!showForm)}>
                        {showForm ? 'Cancel' : '+ New Sprint'}
                    </button>
                )}
            </div>

            {showForm && (
                <div className="card card-body mb-24">
                    <form onSubmit={handleCreateSprint}>
                        <div className="form-group">
                            <label className="label">Sprint name *</label>
                            <input className="input" type="text" value={name} onChange={e => setName(e.target.value)} required />
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
                            {creating ? 'Creating…' : 'Create Sprint'}
                        </button>
                    </form>
                </div>
            )}

            {sprints.length === 0 ? (
                <EmptyState icon="🏃" title="No sprints yet">Add a sprint to start planning tasks.</EmptyState>
            ) : (
                <div className="sprint-list">
                    {sprints.map(s => (
                        <SprintAccordion
                            key={s.id}
                            sprint={s}
                            projectId={projectId}
                            isOrg={isOrg}
                            orgId={orgId}
                            onEdit={(sprint) => setEditSprint(sprint)}
                            onDelete={(sprint) => setConfirmDelete({ type: 'sprint', id: sprint.id, name: sprint.name })}
                        />
                    ))}
                </div>
            )}
        </Layout>
    );
};

export default ProjectDetail;
