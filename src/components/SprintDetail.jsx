import { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import {
    doc, getDoc, collection, addDoc, getDocs, updateDoc, deleteDoc,
    query, orderBy, serverTimestamp, where
} from 'firebase/firestore';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from './Layout';
import UserSelect from './UserSelect';
import { Assignee, EmptyState, Loader, StatusBadge } from './ui';
import { useAuth } from '../context/AuthContext';
import { syncSprintStatus } from './reportData';
import './SprintDetail.css';

const STATUS_OPTIONS = ['todo', 'in-progress', 'done'];

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

const EditTaskModal = ({ task, onSave, onCancel, saving }) => {
    const [form, setForm] = useState({
        title: task.title,
        description: task.description || '',
        estimatedHours: task.estimatedHours || '',
        dueDate: task.dueDate || '',
        assignedTo: task.assignedTo || null,
    });

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
            <div className="card card-body" style={{ maxWidth: 480, width: '90%' }}>
                <h3 className="card-title mb-16">Edit Task</h3>
                <div className="form-group">
                    <label className="label">Title</label>
                    <input className="input" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
                </div>
                <div className="form-group">
                    <label className="label">Description</label>
                    <textarea className="textarea" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
                </div>
                <div className="form-group">
                    <label className="label">Assign to</label>
                    <UserSelect value={form.assignedTo} onChange={v => setForm(p => ({ ...p, assignedTo: v }))} />
                </div>
                <div className="form-row">
                    <div className="form-group">
                        <label className="label">Estimated hours</label>
                        <input className="input" type="number" value={form.estimatedHours} onChange={e => setForm(p => ({ ...p, estimatedHours: e.target.value }))} min="0" step="0.5" />
                    </div>
                    <div className="form-group">
                        <label className="label">Due date</label>
                        <input className="input" type="date" value={form.dueDate} onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))} />
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

const syncProjectSpent = async (orgUid, projectId, userRateMap) => {
    const sprintsSnap = await getDocs(
        collection(db, 'organizations', orgUid, 'projects', projectId, 'sprints')
    );
    let totalSpent = 0;
    for (const sprintDoc of sprintsSnap.docs) {
        const tasksSnap = await getDocs(
            collection(db, 'organizations', orgUid, 'projects', projectId, 'sprints', sprintDoc.id, 'tasks')
        );
        tasksSnap.docs.forEach(t => {
            const data = t.data();
            const rate = userRateMap[data.assignedTo?.uid] || 0;
            totalSpent += (data.actualHours || 0) * rate;
        });
    }
    await updateDoc(
        doc(db, 'organizations', orgUid, 'projects', projectId),
        { spent: parseFloat(totalSpent.toFixed(2)) }
    );
};

const TaskAccordion = ({ task, tasksRef, onRefresh, onDelete, onEdit, userRateMap, orgUid, projectId, isOrg }) => {
    const [open, setOpen] = useState(false);
    const hourlyRate = userRateMap[task.assignedTo?.uid] || 0;
    const cost = (task.actualHours || 0) * hourlyRate;

    const handleStatusChange = async (newStatus) => {
        await updateDoc(doc(tasksRef, task.id), { status: newStatus });
        await syncSprintStatus(orgUid, projectId, tasksRef.parent.id);
        onRefresh();
    };

    const handleActualHoursChange = async (val) => {
        await updateDoc(doc(tasksRef, task.id), { actualHours: parseFloat(val) || 0 });
        await syncProjectSpent(orgUid, projectId, userRateMap);
        onRefresh();
    };

    const handleClockIn = async (e) => {
        e.stopPropagation();
        await updateDoc(doc(tasksRef, task.id), { clockedInAt: new Date().toISOString(), status: 'in-progress' });
        await syncSprintStatus(orgUid, projectId, tasksRef.parent.id);
        onRefresh();
    };

    const handleClockOut = async (e) => {
        e.stopPropagation();
        if (!task.clockedInAt) return;
        const start = new Date(task.clockedInAt);
        const end = new Date();
        const hoursWorked = parseFloat(((end - start) / (1000 * 60 * 60)).toFixed(2));
        const newActual = (task.actualHours || 0) + hoursWorked;
        await updateDoc(doc(tasksRef, task.id), { actualHours: parseFloat(newActual.toFixed(2)), clockedInAt: null });
        await syncProjectSpent(orgUid, projectId, userRateMap);
        onRefresh();
    };

    const isClockedIn = !!task.clockedInAt;

    return (
        <div className="task-accordion">
            <button className="task-accordion-header" onClick={() => setOpen(o => !o)}>
                <div className="task-accordion-left">
                    <span className={`task-chevron ${open ? 'open' : ''}`}>▶</span>
                    <span className="task-accordion-title">{task.title}</span>
                    {isClockedIn && <span className="text-sm" style={{ color: 'var(--success)', fontWeight: 600 }}>🟢</span>}
                </div>
                <div className="task-accordion-right">
                    {task.status !== 'done' && (
                        isClockedIn ? (
                            <button className="btn btn-danger btn-sm" disabled={isOrg} onClick={handleClockOut}>⏹ Clock Out</button>
                        ) : (
                            <button className="btn btn-success btn-sm" disabled={isOrg} onClick={handleClockIn}>▶ Clock In</button>
                        )
                    )}
                    {hourlyRate > 0 && (
                        <span className="hours-cost-chip">${cost.toFixed(2)}</span>
                    )}
                    <StatusBadge status={task.status} />
                    <span className="task-chip">⏱ {task.actualHours || 0}/{task.estimatedHours}h</span>
                    {isOrg && (
                        <>
                            <button
                                className="btn btn-ghost btn-sm"
                                onClick={e => { e.stopPropagation(); onEdit(task); }}
                                title="Edit task"
                            >
                                ✏️
                            </button>
                            <button
                                className="btn btn-ghost btn-sm"
                                style={{ color: 'var(--danger, #de350b)' }}
                                onClick={e => { e.stopPropagation(); onDelete(task); }}
                                title="Delete task"
                            >
                                🗑
                            </button>
                        </>
                    )}
                </div>
            </button>

            {open && (
                <div className="task-accordion-body">
                    {task.description && (
                        <p className="text-muted text-sm" style={{ marginBottom: 12 }}>{task.description}</p>
                    )}
                    <div className="task-detail-grid">
                        <div className="task-detail-item">
                            <label>Assigned to</label>
                            <Assignee user={task.assignedTo} />
                        </div>
                        <div className="task-detail-item">
                            <label>Due date</label>
                            <span>📅 {task.dueDate}</span>
                        </div>
                        <div className="task-detail-item">
                            <label>Estimated hours</label>
                            <span>{task.estimatedHours}h</span>
                        </div>
                        <div className="task-detail-item">
                            <label>Actual hours</label>
                            <input
                                className="input-inline"
                                type="number"
                                defaultValue={task.actualHours || 0}
                                min="0" step="0.5"
                                onBlur={e => handleActualHoursChange(e.target.value)}
                            />
                        </div>
                        {hourlyRate > 0 && (
                            <div className="task-detail-item">
                                <label>Cost (actual hrs × rate)</label>
                                <span style={{ fontWeight: 700, color: 'var(--primary)' }}>
                                    ${cost.toFixed(2)} @ ${hourlyRate}/hr
                                </span>
                            </div>
                        )}
                        <div className="task-detail-item">
                            <label>Status</label>
                            <select
                                className="select-inline"
                                value={task.status}
                                onChange={e => handleStatusChange(e.target.value)}
                            >
                                {STATUS_OPTIONS.map(opt => (
                                    <option key={opt} value={opt}>{opt}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const SprintDetail = () => {
    const { projectId, sprintId } = useParams();
    const navigate = useNavigate();
    const { userRole } = useAuth();
    const isOrg = userRole === 'org';
    const [sprint, setSprint] = useState(null);
    const [tasks, setTasks] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [userRateMap, setUserRateMap] = useState({});
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [editTask, setEditTask] = useState(null);
    const [saving, setSaving] = useState(false);
    const [creating, setCreating] = useState(false);
    const [editSprint, setEditSprint] = useState(false);
    const [sprintForm, setSprintForm] = useState({});

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [assignedTo, setAssignedTo] = useState(null);
    const [estimatedHours, setEstimatedHours] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [error, setError] = useState('');
    const [orgId, setOrgId] = useState(null);

    const user = auth.currentUser;

    const getOrgId = async () => {
        if (isOrg) return user.uid;
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        return userDoc.exists() ? userDoc.data().createdBy : null;
    };

    const sprintRef = () => doc(db, 'organizations', orgId, 'projects', projectId, 'sprints', sprintId);
    const tasksRef = () => collection(sprintRef(), 'tasks');

    const fetchSprint = async () => {
        const snap = await getDoc(sprintRef());
        if (snap.exists()) setSprint({ id: snap.id, ...snap.data() });
    };

    const fetchTasks = async () => {
        let q;
        if (userRole === 'user') {
            q = query(tasksRef(), where('assignedTo.uid', '==', user.uid));
        } else {
            q = query(tasksRef(), orderBy('createdAt', 'desc'));
        }
        const snapshot = await getDocs(q);
        setTasks(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    };

    const fetchUserRates = async () => {
        const usersSnap = await getDocs(query(collection(db, 'users'), where('createdBy', '==', orgId)));
        const map = {};
        usersSnap.docs.forEach(d => { map[d.id] = d.data().hourlyRate || 0; });
        setUserRateMap(map);
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
        fetchSprint();
        fetchTasks();
        fetchUserRates();
    }, [orgId]);

    const handleCreateTask = async (e) => {
        e.preventDefault();
        setError('');
        if (!title || !estimatedHours || !dueDate) { setError('Please fill in all required fields.'); return; }
        setCreating(true);
        try {
            await addDoc(tasksRef(), {
                title, description,
                assignedTo: assignedTo || null,
                status: 'todo',
                estimatedHours: parseFloat(estimatedHours),
                actualHours: 0,
                dueDate,
                createdAt: serverTimestamp(),
            });
            await syncProjectSpent(orgId, projectId, userRateMap);
            await syncSprintStatus(orgId, projectId, sprintId);
            setTitle(''); setDescription(''); setAssignedTo(null);
            setEstimatedHours(''); setDueDate('');
            setShowForm(false);
            fetchTasks();
            fetchSprint();
        } catch (err) { setError(err.message); }
        finally { setCreating(false); }
    };

    const handleSaveTask = async (form) => {
        setSaving(true);
        try {
            await updateDoc(doc(tasksRef(), editTask.id), {
                title: form.title,
                description: form.description || '',
                assignedTo: form.assignedTo || null,
                estimatedHours: parseFloat(form.estimatedHours) || 0,
                dueDate: form.dueDate || '',
            });
            setEditTask(null);
            fetchTasks();
        } catch (err) { setError(err.message); }
        finally { setSaving(false); }
    };

    const handleSaveSprint = async () => {
        setSaving(true);
        try {
            await updateDoc(sprintRef(), {
                name: sprintForm.name,
                startDate: sprintForm.startDate,
                endDate: sprintForm.endDate,
                status: sprintForm.status,
            });
            setEditSprint(false);
            fetchSprint();
        } catch (err) { setError(err.message); }
        finally { setSaving(false); }
    };

    const handleConfirmDelete = async () => {
        if (!confirmDelete) return;
        try {
            if (confirmDelete.type === 'task') {
                await deleteDoc(doc(tasksRef(), confirmDelete.id));
                await syncProjectSpent(orgId, projectId, userRateMap);
                await syncSprintStatus(orgId, projectId, sprintId);
                setConfirmDelete(null);
                fetchTasks();
                fetchSprint();
            } else if (confirmDelete.type === 'sprint') {
                const tasksSnap = await getDocs(tasksRef());
                for (const t of tasksSnap.docs) await deleteDoc(t.ref);
                await deleteDoc(sprintRef());
                await syncProjectSpent(orgId, projectId, userRateMap);
                navigate(`/projects/${projectId}`);
            }
        } catch (err) {
            setError(err.message);
            setConfirmDelete(null);
        }
    };

    const dashboardPath = isOrg ? '/orghome' : '/userhome';

    if (!sprint) {
        return (
            <Layout role={userRole || 'org'} crumbs={[{ label: 'Projects', to: '/projects' }]}>
                <Loader />
            </Layout>
        );
    }

    const totalEstimated = tasks.reduce((s, t) => s + (t.estimatedHours || 0), 0);
    const totalActual = tasks.reduce((s, t) => s + (t.actualHours || 0), 0);
    const totalCost = tasks.reduce((s, t) => {
        const rate = userRateMap[t.assignedTo?.uid] || 0;
        return s + (t.actualHours || 0) * rate;
    }, 0);
    const done = tasks.filter(t => t.status === 'done').length;
    const progressPct = tasks.length > 0 ? (done / tasks.length) * 100 : 0;

    return (
        <Layout role={userRole || 'org'} crumbs={[
            { label: 'Projects', to: '/projects' },
            { label: 'Project', to: `/projects/${projectId}` },
            { label: sprint.name },
        ]}>
            {confirmDelete && (
                <ConfirmDialog
                    message={
                        confirmDelete.type === 'sprint'
                            ? `Delete sprint "${confirmDelete.name}"? All tasks inside will be permanently deleted.`
                            : `Delete task "${confirmDelete.name}"?`
                    }
                    onConfirm={handleConfirmDelete}
                    onCancel={() => setConfirmDelete(null)}
                />
            )}

            {editTask && (
                <EditTaskModal
                    task={editTask}
                    onSave={handleSaveTask}
                    onCancel={() => setEditTask(null)}
                    saving={saving}
                />
            )}

            {editSprint && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                }}>
                    <div className="card card-body" style={{ maxWidth: 480, width: '90%' }}>
                        <h3 className="card-title mb-16">Edit Sprint</h3>
                        <div className="form-group">
                            <label className="label">Name</label>
                            <input className="input" value={sprintForm.name || ''} onChange={e => setSprintForm(p => ({ ...p, name: e.target.value }))} />
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label className="label">Start Date</label>
                                <input className="input" type="date" value={sprintForm.startDate || ''} onChange={e => setSprintForm(p => ({ ...p, startDate: e.target.value }))} />
                            </div>
                            <div className="form-group">
                                <label className="label">End Date</label>
                                <input className="input" type="date" value={sprintForm.endDate || ''} onChange={e => setSprintForm(p => ({ ...p, endDate: e.target.value }))} />
                            </div>
                        </div>
                        <div className="form-group">
                            <label className="label">Status</label>
                            <select className="select" value={sprintForm.status || ''} onChange={e => setSprintForm(p => ({ ...p, status: e.target.value }))}>
                                <option value="planned">Planned</option>
                                <option value="active">Active</option>
                                <option value="completed">Completed</option>
                            </select>
                        </div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
                            <button className="btn btn-ghost" onClick={() => setEditSprint(false)}>Cancel</button>
                            <button className="btn btn-primary" disabled={saving} onClick={handleSaveSprint}>{saving ? 'Saving…' : 'Save'}</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="page-header">
                <div>
                    <h1 className="page-title">{sprint.name}</h1>
                    <p className="page-subtitle">
                        {sprint.startDate} → {sprint.endDate} &nbsp;·&nbsp; <StatusBadge status={sprint.status} />
                    </p>
                </div>
                {isOrg && (
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => { setSprintForm({ name: sprint.name, startDate: sprint.startDate, endDate: sprint.endDate, status: sprint.status }); setEditSprint(true); }}>
                            ✏️ Edit Sprint
                        </button>
                        <button
                            className="btn btn-ghost btn-sm"
                            style={{ color: 'var(--danger, #de350b)' }}
                            onClick={() => setConfirmDelete({ type: 'sprint', id: sprintId, name: sprint.name })}
                        >
                            🗑 Delete Sprint
                        </button>
                        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
                            {showForm ? 'Cancel' : '+ New Task'}
                        </button>
                    </div>
                )}
            </div>

            <div className="card card-body mb-24">
                <div className="sprint-stats-bar">
                    <div className="sprint-stat"><strong>{tasks.length}</strong> tasks</div>
                    <div className="sprint-stat"><strong>{done}</strong> done</div>
                    <div className="sprint-stat"><strong>{totalEstimated}h</strong> estimated</div>
                    <div className="sprint-stat"><strong>{totalActual}h</strong> actual</div>
                    <div className="sprint-stat"><strong>${totalCost.toFixed(2)}</strong> cost (actual hrs)</div>
                    {tasks.length > 0 && (
                        <div className="sprint-stat">
                            <strong>{progressPct.toFixed(0)}%</strong> complete
                        </div>
                    )}
                </div>
                {tasks.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                        <div className="progress">
                            <div className="progress-bar" style={{ width: `${progressPct}%` }} />
                        </div>
                    </div>
                )}
            </div>

            {showForm && (
                <div className="card card-body mb-24">
                    <h3 className="card-title mb-16">Create a task</h3>
                    <form onSubmit={handleCreateTask}>
                        <div className="form-group">
                            <label className="label">Title *</label>
                            <input className="input" type="text" value={title} onChange={e => setTitle(e.target.value)} required />
                        </div>
                        <div className="form-group">
                            <label className="label">Description</label>
                            <textarea className="textarea" value={description} onChange={e => setDescription(e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label className="label">Assign to</label>
                            <UserSelect value={assignedTo} onChange={setAssignedTo} />
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label className="label">Estimated hours *</label>
                                <input className="input" type="number" value={estimatedHours} onChange={e => setEstimatedHours(e.target.value)} min="0" step="0.5" required />
                            </div>
                            <div className="form-group">
                                <label className="label">Due date *</label>
                                <input className="input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} required />
                            </div>
                        </div>
                        {error && <div className="alert alert-error">{error}</div>}
                        <button type="submit" className="btn btn-success" disabled={creating}>
                            {creating ? 'Creating…' : 'Create Task'}
                        </button>
                    </form>
                </div>
            )}

            {tasks.length === 0 ? (
                <EmptyState icon="📝" title="No tasks yet">
                    {isOrg ? 'Create a task to populate the sprint.' : 'No tasks assigned to you in this sprint.'}
                </EmptyState>
            ) : (
                <div>
                    {tasks.map(t => (
                        <TaskAccordion
                            key={t.id}
                            task={t}
                            tasksRef={tasksRef()}
                            onRefresh={fetchTasks}
                            onDelete={(task) => setConfirmDelete({ type: 'task', id: task.id, name: task.title })}
                            onEdit={(task) => setEditTask(task)}
                            userRateMap={userRateMap}
                            orgUid={orgId}
                            projectId={projectId}
                            isOrg={isOrg}
                        />
                    ))}
                </div>
            )}
        </Layout>
    );
};

export default SprintDetail;
