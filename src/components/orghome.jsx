import { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import Layout from './Layout';
import { Loader } from './ui';
import {
    PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
    BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';

const STATUS_COLORS = { Done: '#00875a', 'In Progress': '#ff991f', Todo: '#5e6c84' };

const OrgHome = () => {
    const orgUser = auth.currentUser;
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        projects: 0, sprints: 0, tasks: 0,
        done: 0, inProgress: 0, todo: 0,
        totalBudget: 0, totalSpent: 0,
        totalEstimated: 0, totalActual: 0,
        teamMembers: 0,
    });

    useEffect(() => {
        const load = async () => {
            const projectsSnap = await getDocs(collection(db, 'organizations', orgUser.uid, 'projects'));
            const projects = projectsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            const usersSnap = await getDocs(query(collection(db, 'users'), where('createdBy', '==', orgUser.uid)));
            const rateMap = {};
            usersSnap.docs.forEach(d => { rateMap[d.id] = d.data().hourlyRate || 0; });

            let sprints = 0, tasks = 0, done = 0, inProgress = 0, todo = 0;
            let totalBudget = 0, totalSpent = 0, totalEstimated = 0, totalActual = 0;

            for (const p of projects) {
                totalBudget += p.budget || 0;
                const sprintsSnap = await getDocs(collection(db, 'organizations', orgUser.uid, 'projects', p.id, 'sprints'));
                sprints += sprintsSnap.size;

                for (const s of sprintsSnap.docs) {
                    const tasksSnap = await getDocs(collection(db, 'organizations', orgUser.uid, 'projects', p.id, 'sprints', s.id, 'tasks'));
                    tasksSnap.docs.forEach(t => {
                        const data = t.data();
                        tasks++;
                        if (data.status === 'done') done++;
                        else if (data.status === 'in-progress') inProgress++;
                        else todo++;
                        totalEstimated += data.estimatedHours || 0;
                        totalActual += data.actualHours || 0;
                        totalSpent += (data.actualHours || 0) * (rateMap[data.assignedTo?.uid] || 0);
                    });
                }
            }

            setStats({
                projects: projects.length, sprints, tasks, done, inProgress, todo,
                totalBudget, totalSpent: parseFloat(totalSpent.toFixed(2)),
                totalEstimated, totalActual,
                teamMembers: usersSnap.size,
            });
            setLoading(false);
        };
        load();
    }, []);

    if (loading) {
        return <Layout role="org" crumbs={[{ label: 'Dashboard' }]}><Loader /></Layout>;
    }

    const completionRate = stats.tasks > 0 ? ((stats.done / stats.tasks) * 100).toFixed(0) : 0;
    const budgetUsed = stats.totalBudget > 0 ? ((stats.totalSpent / stats.totalBudget) * 100).toFixed(1) : 0;

    const pieData = [
        { name: 'Done', value: stats.done },
        { name: 'In Progress', value: stats.inProgress },
        { name: 'Todo', value: stats.todo },
    ].filter(d => d.value > 0);

    const budgetData = [
        { name: 'Budget', Budget: stats.totalBudget, Spent: stats.totalSpent },
    ];

    return (
        <Layout role="org" crumbs={[{ label: 'Dashboard' }]}>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Dashboard</h1>
                    <p className="page-subtitle">Overview of your workspace — {orgUser?.email}</p>
                </div>
            </div>

            <div className="stat-grid">
                <div className="stat-card">
                    <div className="stat-label">Projects</div>
                    <div className="stat-value">{stats.projects}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Sprints</div>
                    <div className="stat-value">{stats.sprints}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Tasks</div>
                    <div className="stat-value">{stats.tasks}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Completion</div>
                    <div className="stat-value success">{completionRate}%</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Team Members</div>
                    <div className="stat-value primary">{stats.teamMembers}</div>
                </div>
            </div>

            <div className="stat-grid">
                <div className="stat-card">
                    <div className="stat-label">Total Budget</div>
                    <div className="stat-value">${stats.totalBudget.toLocaleString()}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Total Spent</div>
                    <div className="stat-value danger">${stats.totalSpent.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Remaining</div>
                    <div className="stat-value success">${(stats.totalBudget - stats.totalSpent).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Budget Used</div>
                    <div className="stat-value">{budgetUsed}%</div>
                </div>
            </div>

            {stats.tasks > 0 && (
                <div className="grid grid-2 mb-24">
                    <div className="chart-card">
                        <h3 className="card-title mb-16">Task Status Overview</h3>
                        <div style={{ width: '100%', height: 260 }}>
                            <ResponsiveContainer>
                                <PieChart>
                                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} label>
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
                        <h3 className="card-title mb-16">Budget vs. Spent</h3>
                        <div style={{ width: '100%', height: 260 }}>
                            <ResponsiveContainer>
                                <BarChart data={budgetData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                                    <YAxis tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                                    <Tooltip formatter={v => `$${v.toLocaleString()}`} />
                                    <Legend />
                                    <Bar dataKey="Budget" fill="#0052cc" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="Spent" fill="#de350b" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            )}

            <div className="stat-grid">
                <div className="stat-card">
                    <div className="stat-label">Estimated Hours</div>
                    <div className="stat-value">{stats.totalEstimated}h</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Actual Hours</div>
                    <div className="stat-value">{stats.totalActual}h</div>
                </div>
            </div>
        </Layout>
    );
};

export default OrgHome;
