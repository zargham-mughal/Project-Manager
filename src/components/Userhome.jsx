import './Userhome.css';
import { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import Layout from './Layout';
import { EmptyState, Loader, StatusBadge } from './ui';
import { fetchUserTasks, fetchUserSprints, syncSprintStatus } from './reportData';
import {
    PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
    BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';

const STATUS_OPTIONS = ['todo', 'in-progress', 'done'];
const STATUS_COLORS = { Done: '#00875a', 'In Progress': '#ff991f', Todo: '#5e6c84' };

const UserHome = () => {
    const [tasks, setTasks] = useState([]);
    const [sprints, setSprints] = useState([]);
    const [orgId, setOrgId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [openSprintId, setOpenSprintId] = useState(null);
    const user = auth.currentUser;

    const loadData = async () => {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (!userDoc.exists()) {
            setLoading(false);
            return;
        }
        const createdBy = userDoc.data().createdBy;
        setOrgId(createdBy);

        const [userTasks, userSprints] = await Promise.all([
            fetchUserTasks(createdBy, user.uid),
            fetchUserSprints(createdBy, user.uid),
        ]);
        setTasks(userTasks);
        setSprints(userSprints);
        setLoading(false);
    };

    useEffect(() => {
        loadData();
    }, []);

    const getTaskRef = (task) =>
        doc(db, 'organizations', orgId, 'projects', task.projectId, 'sprints', task.sprintId, 'tasks', task.id);

    const handleStatusChange = async (task, newStatus) => {
        await updateDoc(getTaskRef(task), { status: newStatus });
        await syncSprintStatus(orgId, task.projectId, task.sprintId);
        loadData();
    };

    const handleClockIn = async (task) => {
        await updateDoc(getTaskRef(task), { clockedInAt: new Date().toISOString() });
        loadData();
    };

    const handleClockOut = async (task) => {
        if (!task.clockedInAt) return;
        const start = new Date(task.clockedInAt);
        const end = new Date();
        const hoursWorked = parseFloat(((end - start) / (1000 * 60 * 60)).toFixed(2));
        const newActual = (task.actualHours || 0) + hoursWorked;
        await updateDoc(getTaskRef(task), {
            actualHours: parseFloat(newActual.toFixed(2)),
            clockedInAt: null,
        });
        loadData();
    };

    if (loading) {
        return <Layout role="user"><Loader /></Layout>;
    }

    const total = tasks.length;
    const done = tasks.filter(t => t.status === 'done').length;
    const inProgress = tasks.filter(t => t.status === 'in-progress').length;
    const todo = tasks.filter(t => t.status === 'todo').length;
    const totalEstimated = tasks.reduce((s, t) => s + (t.estimatedHours || 0), 0);
    const totalActual = tasks.reduce((s, t) => s + (t.actualHours || 0), 0);

    const pieData = [
        { name: 'Done', value: done },
        { name: 'In Progress', value: inProgress },
        { name: 'Todo', value: todo },
    ].filter(d => d.value > 0);

    const hoursData = [{ name: 'Hours', Estimated: totalEstimated, Actual: totalActual }];

    const tasksBySprint = {};
    tasks.forEach(t => {
        if (!tasksBySprint[t.sprintId]) {
            tasksBySprint[t.sprintId] = {
                sprintId: t.sprintId,
                sprintName: t.sprintName,
                projectName: t.projectName,
                tasks: [],
            };
        }
        tasksBySprint[t.sprintId].tasks.push(t);
    });

    return (
        <Layout role="user" crumbs={[{ label: 'My Dashboard' }]}>
            <div className="page-header">
                <div>
                    <h1 className="page-title">My Dashboard</h1>
                    <p className="page-subtitle">Welcome back, {user?.email}</p>
                </div>
            </div>

            <div className="stat-grid">
                <div className="stat-card">
                    <div className="stat-label">Total Tasks</div>
                    <div className="stat-value">{total}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Completed</div>
                    <div className="stat-value success">{done}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">In Progress</div>
                    <div className="stat-value primary">{inProgress}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Completion Rate</div>
                    <div className="stat-value">{total > 0 ? ((done / total) * 100).toFixed(0) : 0}%</div>
                </div>
            </div>

            {total > 0 && (
                <div className="grid grid-2 mb-24">
                    <div className="chart-card">
                        <h3 className="card-title mb-16">Task Status</h3>
                        <div style={{ width: '100%', height: 260 }}>
                            <ResponsiveContainer>
                                <PieChart>
                                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} label>
                                        {pieData.map((entry, index) => (
                                            <Cell key={index} fill={STATUS_COLORS[entry.name] || '#999'} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                    <div className="chart-card">
                        <h3 className="card-title mb-16">Estimated vs. Actual Hours</h3>
                        <div style={{ width: '100%', height: 260 }}>
                            <ResponsiveContainer>
                                <BarChart data={hoursData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#ebecf0" />
                                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#5e6c84' }} />
                                    <YAxis tick={{ fontSize: 12, fill: '#5e6c84' }} />
                                    <Tooltip />
                                    <Legend />
                                    <Bar dataKey="Estimated" fill="#0052cc" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="Actual" fill="#de350b" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            )}

            <h3 className="section-title">My Sprints & Tasks</h3>
            {Object.keys(tasksBySprint).length === 0 ? (
                <EmptyState icon="🏃" title="No tasks assigned">Tasks assigned to you will appear here grouped by sprint.</EmptyState>
            ) : (
                <div className="sprint-list">
                    {Object.values(tasksBySprint).map(group => {
                        const sprintInfo = sprints.find(s => s.id === group.sprintId);
                        const isOpen = openSprintId === group.sprintId;
                        const groupDone = group.tasks.filter(t => t.status === 'done').length;
                        const pct = group.tasks.length > 0 ? (groupDone / group.tasks.length) * 100 : 0;

                        return (
                            <div key={group.sprintId} className="sprint-accordion">
                                <button className="sprint-accordion-header" onClick={() => setOpenSprintId(isOpen ? null : group.sprintId)}>
                                    <div className="sprint-accordion-left">
                                        <span className={`sprint-chevron ${isOpen ? 'open' : ''}`}>▶</span>
                                        <div>
                                            <div className="sprint-name">{group.sprintName}</div>
                                            <div className="sprint-dates text-sm text-muted">{group.projectName}</div>
                                        </div>
                                    </div>
                                    <div className="sprint-accordion-right">
                                        <div className="sprint-progress-wrap">
                                            <div className="progress" style={{ width: 80 }}>
                                                <div className="progress-bar" style={{ width: `${pct}%` }} />
                                            </div>
                                            <span className="text-sm text-muted">{pct.toFixed(0)}%</span>
                                        </div>
                                        {sprintInfo && <StatusBadge status={sprintInfo.status} />}
                                        <span className="task-chip">{group.tasks.length} tasks · {groupDone} done</span>
                                    </div>
                                </button>
                                {isOpen && (
                                    <div className="sprint-accordion-body">
                                        <div className="board">
                                            <div className="board-col">
                                                <div className="board-col-header">
                                                    Todo <span className="count">{group.tasks.filter(t => t.status === 'todo').length}</span>
                                                </div>
                                                <div className="board-col-body">
                                                    {group.tasks.filter(t => t.status === 'todo').map(t => (
                                                        <UserTaskCard key={t.id} task={t} onStatusChange={handleStatusChange} onClockIn={handleClockIn} onClockOut={handleClockOut} />
                                                    ))}
                                                    {group.tasks.filter(t => t.status === 'todo').length === 0 && <div className="board-col-empty">No tasks</div>}
                                                </div>
                                            </div>
                                            <div className="board-col">
                                                <div className="board-col-header">
                                                    In Progress <span className="count">{group.tasks.filter(t => t.status === 'in-progress').length}</span>
                                                </div>
                                                <div className="board-col-body">
                                                    {group.tasks.filter(t => t.status === 'in-progress').map(t => (
                                                        <UserTaskCard key={t.id} task={t} onStatusChange={handleStatusChange} onClockIn={handleClockIn} onClockOut={handleClockOut} />
                                                    ))}
                                                    {group.tasks.filter(t => t.status === 'in-progress').length === 0 && <div className="board-col-empty">No tasks</div>}
                                                </div>
                                            </div>
                                            <div className="board-col">
                                                <div className="board-col-header">
                                                    Done <span className="count">{group.tasks.filter(t => t.status === 'done').length}</span>
                                                </div>
                                                <div className="board-col-body">
                                                    {group.tasks.filter(t => t.status === 'done').map(t => (
                                                        <UserTaskCard key={t.id} task={t} onStatusChange={handleStatusChange} onClockIn={handleClockIn} onClockOut={handleClockOut} />
                                                    ))}
                                                    {group.tasks.filter(t => t.status === 'done').length === 0 && <div className="board-col-empty">No tasks</div>}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </Layout>
    );
};

const UserTaskCard = ({ task, onStatusChange, onClockIn, onClockOut }) => {
    const isClockedIn = !!task.clockedInAt;

    return (
        <div className="task-card">
            <div className="task-title">{task.title}</div>
            <div className="task-meta">
                <span>⏱ {task.actualHours || 0}/{task.estimatedHours}h</span>
                {task.dueDate && <span>📅 {task.dueDate}</span>}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                    className="select-inline"
                    value={task.status}
                    onChange={e => onStatusChange(task, e.target.value)}
                >
                    {STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
                {task.status !== 'done' && (
                    isClockedIn ? (
                        <button className="btn btn-danger btn-sm" onClick={() => onClockOut(task)}>
                            ⏹ Clock Out
                        </button>
                    ) : (
                        <button className="btn btn-success btn-sm" onClick={() => onClockIn(task)}>
                            ▶ Clock In
                        </button>
                    )
                )}
                {isClockedIn && task.status !== 'done' && (
                    <span className="text-sm" style={{ color: 'var(--success)', fontWeight: 600 }}>
                        🟢 Working…
                    </span>
                )}
            </div>
        </div>
    );
};

export default UserHome;
