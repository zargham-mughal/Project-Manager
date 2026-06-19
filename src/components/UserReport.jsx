import { useState, useEffect, useRef } from 'react';
import { auth, db } from '../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import Layout from './Layout';
import { Avatar, EmptyState, Loader, StatusBadge } from './ui';
import { fetchUserTasks, fetchUserSprints } from './reportData';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell
} from 'recharts';
import './UserReport.css';
import './SprintDetail.css';

const STATUS_COLORS = { Done: '#00875a', 'In Progress': '#ff991f', Todo: '#5e6c84' };

const SearchableUserSelect = ({ users, selectedUserId, onSelect }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const wrapRef = useRef(null);

    useEffect(() => {
        const handleClick = (e) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target)) setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const filtered = users.filter(u => {
        const term = searchTerm.toLowerCase();
        return (u.name || '').toLowerCase().includes(term) || (u.email || '').toLowerCase().includes(term);
    });

    const selectedUser = users.find(u => u.id === selectedUserId);

    return (
        <div className="searchable-select" ref={wrapRef}>
            <div className="searchable-select-input-wrap">
                <span className="searchable-select-icon">🔍</span>
                <input
                    className="input searchable-select-input"
                    type="text"
                    placeholder="Search for a team member…"
                    value={searchTerm}
                    onKeyDown={e => { if (/[0-9]/.test(e.key)) e.preventDefault(); }}
                    onChange={e => { setSearchTerm(e.target.value.replace(/[0-9]/g, '')); setIsOpen(true); }}
                    onFocus={() => setIsOpen(true)}
                />
                {selectedUser && !isOpen && (
                    <div className="searchable-select-selected" onClick={() => { setSearchTerm(''); setIsOpen(true); }}>
                        <Avatar name={selectedUser.name} email={selectedUser.email} small />
                        <span>{selectedUser.name || selectedUser.email}</span>
                        <button className="searchable-select-clear" onClick={e => { e.stopPropagation(); onSelect(null); setSearchTerm(''); }}>✕</button>
                    </div>
                )}
            </div>
            {isOpen && (
                <div className="searchable-select-dropdown">
                    {filtered.length === 0 ? (
                        <div className="searchable-select-empty">No matching users found</div>
                    ) : (
                        filtered.map(u => (
                            <button
                                key={u.id}
                                className={`searchable-select-option ${selectedUserId === u.id ? 'active' : ''}`}
                                onClick={() => { onSelect(u.id); setIsOpen(false); setSearchTerm(''); }}
                            >
                                <Avatar name={u.name} email={u.email} small />
                                <div>
                                    <div style={{ fontWeight: 600 }}>{u.name || 'N/A'}</div>
                                    <div className="text-sm text-muted">{u.email}</div>
                                </div>
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

const UserDetailReport = ({ user, orgId }) => {
    const [tasks, setTasks] = useState([]);
    const [sprints, setSprints] = useState([]);
    const [loading, setLoading] = useState(true);
    const [openSprintId, setOpenSprintId] = useState(null);
    const [sprintSearch, setSprintSearch] = useState('');

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            const [userTasks, userSprints] = await Promise.all([
                fetchUserTasks(orgId, user.id),
                fetchUserSprints(orgId, user.id),
            ]);
            setTasks(userTasks);
            setSprints(userSprints);
            setLoading(false);
        };
        load();
    }, [user.id, orgId]);

    if (loading) return <Loader label="Loading user data…" />;

    const total = tasks.length;
    const done = tasks.filter(t => t.status === 'done').length;
    const inProgress = tasks.filter(t => t.status === 'in-progress').length;
    const todo = tasks.filter(t => t.status === 'todo').length;
    const totalEstimated = tasks.reduce((s, t) => s + (t.estimatedHours || 0), 0);
    const totalActual = tasks.reduce((s, t) => s + (t.actualHours || 0), 0);
    const totalCost = totalActual * (user.hourlyRate || 0);
    const completionRate = total > 0 ? ((done / total) * 100).toFixed(0) : 0;

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
        <div>
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
                    <div className="stat-label">Completion Rate</div>
                    <div className="stat-value">{completionRate}%</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Hourly Rate</div>
                    <div className="stat-value primary">${user.hourlyRate || 0}/hr</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Actual Hours</div>
                    <div className="stat-value">{totalActual}h</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Total Cost</div>
                    <div className="stat-value danger">${totalCost.toFixed(2)}</div>
                </div>
            </div>

            {total > 0 && (
                <div className="grid grid-2 mb-24">
                    <div className="chart-card">
                        <h3 className="card-title mb-16">Task Status</h3>
                        <div style={{ width: '100%', height: 240 }}>
                            <ResponsiveContainer>
                                <PieChart>
                                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                                        {pieData.map((entry, i) => (
                                            <Cell key={i} fill={STATUS_COLORS[entry.name] || '#999'} />
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
                        <div style={{ width: '100%', height: 240 }}>
                            <ResponsiveContainer>
                                <BarChart data={hoursData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                                    <YAxis tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                                    <Tooltip />
                                    <Legend />
                                    <Bar dataKey="Estimated" fill="#0052cc" radius={[4,4,0,0]} />
                                    <Bar dataKey="Actual" fill="#de350b" radius={[4,4,0,0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            )}

            <h3 className="section-title">Sprints ({sprints.length})</h3>
            {sprints.length > 0 && (
                <div className="searchable-select mb-16" style={{ maxWidth: '100%' }}>
                    <div className="searchable-select-input-wrap">
                        <span className="searchable-select-icon">🔍</span>
                        <input
                            className="input searchable-select-input"
                            type="text"
                            placeholder="Search sprints…"
                            value={sprintSearch}
                            onKeyDown={e => { if (/[0-9]/.test(e.key)) e.preventDefault(); }}
                            onChange={e => setSprintSearch(e.target.value.replace(/[0-9]/g, ''))}
                        />
                    </div>
                </div>
            )}
            {sprints.length === 0 ? (
                <EmptyState icon="🏃" title="No sprints">This user has no sprint assignments.</EmptyState>
            ) : (
                Object.values(tasksBySprint).filter(group =>
                    !sprintSearch || group.sprintName.toLowerCase().includes(sprintSearch.toLowerCase())
                ).map(group => {
                    const isOpen = openSprintId === group.sprintId;
                    const sprintInfo = sprints.find(s => s.id === group.sprintId);
                    const sprintDone = group.tasks.filter(t => t.status === 'done').length;
                    const sprintCost = group.tasks.reduce((s, t) => s + (t.actualHours || 0) * (user.hourlyRate || 0), 0);
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
                                    {sprintInfo && <StatusBadge status={sprintInfo.status} />}
                                    <span className="task-chip">{group.tasks.length} tasks · {sprintDone} done</span>
                                    <span className="hours-cost-chip">${sprintCost.toFixed(2)}</span>
                                </div>
                            </button>
                            {isOpen && (
                                <div className="sprint-accordion-body">
                                    {sprintInfo && (
                                        <p className="text-muted text-sm mb-16">
                                            {sprintInfo.startDate} → {sprintInfo.endDate}
                                        </p>
                                    )}
                                    {group.tasks.map(t => {
                                        const taskCost = (t.actualHours || 0) * (user.hourlyRate || 0);
                                        return (
                                            <div key={t.id} className="task-accordion">
                                                <div className="task-accordion-header" style={{ cursor: 'default' }}>
                                                    <div className="task-accordion-left">
                                                        <span className="task-accordion-title">{t.title}</span>
                                                    </div>
                                                    <div className="task-accordion-right">
                                                        <span className="hours-cost-chip">${taskCost.toFixed(2)}</span>
                                                        <StatusBadge status={t.status} />
                                                        <span className="task-chip">⏱ {t.actualHours || 0}/{t.estimatedHours}h</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })
            )}
        </div>
    );
};

const UserReport = () => {
    const [users, setUsers] = useState([]);
    const [selectedUserId, setSelectedUserId] = useState(null);
    const [loading, setLoading] = useState(true);
    const orgUser = auth.currentUser;

    useEffect(() => {
        const load = async () => {
            const usersQuery = query(collection(db, 'users'), where('createdBy', '==', orgUser.uid));
            const usersSnap = await getDocs(usersQuery);
            const list = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            setUsers(list);
            setLoading(false);
        };
        load();
    }, []);

    const selectedUser = users.find(u => u.id === selectedUserId);

    return (
        <Layout role="org" crumbs={[{ label: 'Dashboard', to: '/orghome' }, { label: 'User Report' }]}>
            <div className="page-header">
                <div>
                    <h1 className="page-title">User Performance Report</h1>
                    <p className="page-subtitle">Search for a team member to view their detailed report</p>
                </div>
            </div>

            {loading ? (
                <Loader />
            ) : users.length === 0 ? (
                <EmptyState icon="📊" title="No users yet">Add team members to generate this report.</EmptyState>
            ) : (
                <>
                    <div className="mb-24">
                        <SearchableUserSelect
                            users={users}
                            selectedUserId={selectedUserId}
                            onSelect={setSelectedUserId}
                        />
                    </div>

                    {selectedUser ? (
                        <div>
                            <div className="report-section-header">
                                <Avatar name={selectedUser.name} email={selectedUser.email} />
                                {selectedUser.name || selectedUser.email}
                                <span className="text-muted text-sm" style={{ fontWeight: 400 }}>
                                    — {selectedUser.email} · ${selectedUser.hourlyRate || 0}/hr
                                    {selectedUser.startTime && selectedUser.endTime
                                        ? ` · ${selectedUser.startTime} – ${selectedUser.endTime}`
                                        : selectedUser.shiftHours ? ` · ${selectedUser.shiftHours}h shift` : ''}
                                </span>
                            </div>
                            <UserDetailReport user={selectedUser} orgId={orgUser.uid} />
                        </div>
                    ) : (
                        <EmptyState icon="🔍" title="Search for a user">
                            Type a name or email above to view their performance report.
                        </EmptyState>
                    )}
                </>
            )}
        </Layout>
    );
};

export default UserReport;
