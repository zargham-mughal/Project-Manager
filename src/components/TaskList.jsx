import { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { doc, getDoc, updateDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { useSearchParams } from 'react-router-dom';
import Layout from './Layout';
import { EmptyState, Loader, StatusBadge } from './ui';
import { syncSprintStatus } from './reportData';
import SearchableDropdown from './SearchableDropdown';
import { useAuth } from '../context/AuthContext';

const STATUS_OPTIONS = ['todo', 'in-progress', 'done'];

const TaskList = () => {
    const { userRole } = useAuth();
    const [searchParams] = useSearchParams();
    const initialProject = searchParams.get('project') || '';
    const initialSprint = searchParams.get('sprint') || '';
    const [tasks, setTasks] = useState([]);
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [projectFilter, setProjectFilter] = useState(initialProject);
    const [sprintFilter, setSprintFilter] = useState(initialSprint);
    const [orgId, setOrgId] = useState(null);
    const user = auth.currentUser;

    const getOrgId = async () => {
        if (userRole === 'org') return user.uid;
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        return userDoc.exists() ? userDoc.data().createdBy : null;
    };

    const loadData = async () => {
        const oid = await getOrgId();
        if (!oid) { setLoading(false); return; }
        setOrgId(oid);

        const projectsSnap = await getDocs(collection(db, 'organizations', oid, 'projects'));
        const projectList = projectsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setProjects(projectList);

        const allTasks = [];
        for (const project of projectList) {
            const sprintsSnap = await getDocs(collection(db, 'organizations', oid, 'projects', project.id, 'sprints'));
            for (const sprintDoc of sprintsSnap.docs) {
                const tasksRef = collection(db, 'organizations', oid, 'projects', project.id, 'sprints', sprintDoc.id, 'tasks');
                let tasksSnap;
                if (userRole === 'user') {
                    tasksSnap = await getDocs(query(tasksRef, where('assignedTo.uid', '==', user.uid)));
                } else {
                    tasksSnap = await getDocs(tasksRef);
                }
                tasksSnap.docs.forEach(d => {
                    allTasks.push({
                        id: d.id,
                        projectId: project.id,
                        projectName: project.name,
                        sprintId: sprintDoc.id,
                        sprintName: sprintDoc.data().name,
                        ...d.data(),
                    });
                });
            }
        }

        setTasks(allTasks);
        setLoading(false);
    };

    useEffect(() => { loadData(); }, []);

    const getTaskRef = (task) => doc(db, 'organizations', orgId, 'projects', task.projectId, 'sprints', task.sprintId, 'tasks', task.id);

    const handleStatusChange = async (task, newStatus) => {
        await updateDoc(getTaskRef(task), { status: newStatus });
        await syncSprintStatus(orgId, task.projectId, task.sprintId);
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
    };

    const handleClockIn = async (task) => {
        await updateDoc(getTaskRef(task), { clockedInAt: new Date().toISOString(), status: 'in-progress' });
        await syncSprintStatus(orgId, task.projectId, task.sprintId);
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, clockedInAt: new Date().toISOString(), status: 'in-progress' } : t));
    };

    const handleClockOut = async (task) => {
        if (!task.clockedInAt) return;
        const start = new Date(task.clockedInAt);
        const end = new Date();
        const hoursWorked = parseFloat(((end - start) / (1000 * 60 * 60)).toFixed(2));
        const newActual = (task.actualHours || 0) + hoursWorked;
        await updateDoc(getTaskRef(task), { actualHours: parseFloat(newActual.toFixed(2)), clockedInAt: null });
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, actualHours: parseFloat(newActual.toFixed(2)), clockedInAt: null } : t));
    };

    const filtered = !projectFilter ? [] : tasks.filter(t => {
        if (projectFilter !== 'all' && t.projectId !== projectFilter) return false;
        if (sprintFilter && t.sprintId !== sprintFilter) return false;
        return true;
    });

    const todoTasks = filtered.filter(t => t.status === 'todo');
    const inProgressTasks = filtered.filter(t => t.status === 'in-progress');
    const doneTasks = filtered.filter(t => t.status === 'done');

    const role = userRole || 'org';
    const dashboardPath = role === 'org' ? '/orghome' : '/userhome';

    const TaskCard = ({ task }) => {
        const isClockedIn = !!task.clockedInAt;
        return (
            <div className="task-card">
                <div className="task-title">{task.title}</div>
                {task.description && <div className="task-desc">{task.description}</div>}
                <div className="task-meta">
                    <span>⏱ {task.actualHours || 0}/{task.estimatedHours}h</span>
                    {task.dueDate && <span>📅 {task.dueDate}</span>}
                </div>
                <div className="task-meta">
                    <span className="text-muted">{task.projectName} / {task.sprintName}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <select
                        className="select-inline"
                        value={task.status}
                        onChange={e => handleStatusChange(task, e.target.value)}
                    >
                        {STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                    {task.status !== 'done' && (
                        isClockedIn ? (
                            <button className="btn btn-danger btn-sm" disabled={userRole === 'org'} onClick={() => handleClockOut(task)}>⏹ Clock Out</button>
                        ) : (
                            <button className="btn btn-success btn-sm" disabled={userRole === 'org'} onClick={() => handleClockIn(task)}>▶ Clock In</button>
                        )
                    )}
                    {isClockedIn && task.status !== 'done' && (
                        <span className="text-sm" style={{ color: 'var(--success)', fontWeight: 600 }}>🟢 Working…</span>
                    )}
                </div>
            </div>
        );
    };

    return (
        <Layout role={role} crumbs={[{ label: 'Dashboard', to: dashboardPath }, { label: 'Tasks' }]}>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Tasks</h1>
                    <p className="page-subtitle">{filtered.length} task{filtered.length !== 1 ? 's' : ''} {userRole === 'user' ? 'assigned to you' : 'across all projects'}</p>
                </div>
            </div>

            <div className="filter-bar mb-24">
                <div className="filter-group" style={{ flex: 1, minWidth: 240 }}>
                    <label className="label">Project</label>
                    <SearchableDropdown
                        items={projects}
                        selectedId={projectFilter}
                        onSelect={(id) => { setProjectFilter(id); setSprintFilter(''); }}
                        placeholder="Search for a project…"
                        allOption="All Projects"
                        renderItem={p => ({ searchText: p.name, node: <div><div style={{ fontWeight: 600 }}>{p.name}</div></div> })}
                    />
                </div>
            </div>

            {loading ? <Loader /> : !projectFilter ? (
                <EmptyState icon="🔍" title="Select a project">
                    Choose a project above or select "All Projects" to view tasks.
                </EmptyState>
            ) : filtered.length === 0 ? (
                <EmptyState icon="📝" title="No tasks found">
                    {tasks.length > 0 ? 'No tasks in this project.' : 'No tasks have been created yet.'}
                </EmptyState>
            ) : (
                <div className="board">
                    <div className="board-col">
                        <div className="board-col-header">
                            Todo <span className="count">{todoTasks.length}</span>
                        </div>
                        <div className="board-col-body">
                            {todoTasks.length === 0 ? (
                                <div className="board-col-empty">No tasks</div>
                            ) : todoTasks.map(t => <TaskCard key={t.id} task={t} />)}
                        </div>
                    </div>
                    <div className="board-col">
                        <div className="board-col-header">
                            In Progress <span className="count">{inProgressTasks.length}</span>
                        </div>
                        <div className="board-col-body">
                            {inProgressTasks.length === 0 ? (
                                <div className="board-col-empty">No tasks</div>
                            ) : inProgressTasks.map(t => <TaskCard key={t.id} task={t} />)}
                        </div>
                    </div>
                    <div className="board-col">
                        <div className="board-col-header">
                            Done <span className="count">{doneTasks.length}</span>
                        </div>
                        <div className="board-col-body">
                            {doneTasks.length === 0 ? (
                                <div className="board-col-empty">No tasks</div>
                            ) : doneTasks.map(t => <TaskCard key={t.id} task={t} />)}
                        </div>
                    </div>
                </div>
            )}
        </Layout>
    );
};

export default TaskList;
