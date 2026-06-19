import { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { doc, getDoc, collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { Link, useNavigate } from 'react-router-dom';
import Layout from './Layout';
import { EmptyState, Loader, StatusBadge } from './ui';
import { useAuth } from '../context/AuthContext';
import { syncSprintStatus } from './reportData';
import SearchableDropdown from './SearchableDropdown';

const SprintList = () => {
    const { userRole } = useAuth();
    const [sprints, setSprints] = useState([]);
    const [projects, setProjects] = useState([]);
    const [taskCounts, setTaskCounts] = useState({});
    const [loading, setLoading] = useState(true);
    const [projectFilter, setProjectFilter] = useState('');
    const user = auth.currentUser;

    const getOrgId = async () => {
        if (userRole === 'org') return user.uid;
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        return userDoc.exists() ? userDoc.data().createdBy : null;
    };

    const loadData = async () => {
        const orgId = await getOrgId();
        if (!orgId) { setLoading(false); return; }

        const projectsSnap = await getDocs(collection(db, 'organizations', orgId, 'projects'));
        const projectList = projectsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setProjects(projectList);

        const allSprints = [];
        const counts = {};

        for (const project of projectList) {
            const sprintsRef = collection(db, 'organizations', orgId, 'projects', project.id, 'sprints');
            const sprintsSnap = await getDocs(query(sprintsRef, orderBy('createdAt', 'desc')));

            for (const sprintDoc of sprintsSnap.docs) {
                const sprintData = { id: sprintDoc.id, projectId: project.id, projectName: project.name, ...sprintDoc.data() };

                const tasksRef = collection(db, 'organizations', orgId, 'projects', project.id, 'sprints', sprintDoc.id, 'tasks');
                let tasksSnap;
                if (userRole === 'user') {
                    tasksSnap = await getDocs(query(tasksRef, where('assignedTo.uid', '==', user.uid)));
                } else {
                    tasksSnap = await getDocs(tasksRef);
                }

                const tasks = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                if (userRole === 'user' && tasks.length === 0) continue;

                const total = tasks.length;
                const done = tasks.filter(t => t.status === 'done').length;
                const anyStarted = tasks.some(t => t.status === 'in-progress' || t.status === 'done');
                let correctStatus = 'planned';
                if (total > 0 && done === total) correctStatus = 'completed';
                else if (anyStarted) correctStatus = 'active';

                if (sprintData.status !== correctStatus) {
                    sprintData.status = correctStatus;
                    syncSprintStatus(orgId, project.id, sprintDoc.id);
                }

                counts[sprintDoc.id] = { total, done };
                allSprints.push(sprintData);
            }
        }

        setSprints(allSprints);
        setTaskCounts(counts);
        setLoading(false);
    };

    useEffect(() => { loadData(); }, []);

    const filtered = !projectFilter ? [] : sprints.filter(s => {
        if (projectFilter !== 'all' && s.projectId !== projectFilter) return false;
        return true;
    });

    const planned = filtered.filter(s => s.status === 'planned');
    const active = filtered.filter(s => s.status === 'active');
    const completed = filtered.filter(s => s.status === 'completed');

    const role = userRole || 'org';
    const dashboardPath = role === 'org' ? '/orghome' : '/userhome';
    const navigate = useNavigate();

    const SprintCard = ({ sprint }) => {
        const c = taskCounts[sprint.id] || { total: 0, done: 0 };
        const pct = c.total > 0 ? (c.done / c.total) * 100 : 0;

        return (
            <div className="task-card" style={{ cursor: 'pointer' }} onClick={() => navigate(`/tasks?project=${sprint.projectId}&sprint=${sprint.id}`)}>
                <div className="task-title">{sprint.name}</div>
                <div className="task-desc">{sprint.projectName}</div>
                <div className="task-meta">
                    <span>📅 {sprint.startDate} → {sprint.endDate}</span>
                </div>
                <div className="row-between text-sm" style={{ marginBottom: 6, marginTop: 8 }}>
                    <span className="text-muted">{c.total} tasks · {c.done} done</span>
                    <span style={{ fontWeight: 600 }}>{pct.toFixed(0)}%</span>
                </div>
                <div className="progress">
                    <div className="progress-bar" style={{ width: `${pct}%` }} />
                </div>
                {userRole === 'org' && (
                    <Link
                        to={`/projects/${sprint.projectId}/sprints/${sprint.id}`}
                        className="btn btn-sm btn-primary"
                        style={{ marginTop: 10 }}
                        onClick={e => e.stopPropagation()}
                    >
                        Manage →
                    </Link>
                )}
            </div>
        );
    };

    return (
        <Layout role={role} crumbs={[{ label: 'Dashboard', to: dashboardPath }, { label: 'Sprints' }]}>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Sprints</h1>
                    <p className="page-subtitle">{filtered.length} sprint{filtered.length !== 1 ? 's' : ''} {userRole === 'user' ? 'assigned to you' : 'across all projects'}</p>
                </div>
            </div>

            <div className="filter-bar mb-24">
                <div className="filter-group" style={{ flex: 1, minWidth: 240 }}>
                    <label className="label">Project</label>
                    <SearchableDropdown
                        items={projects}
                        selectedId={projectFilter}
                        onSelect={setProjectFilter}
                        placeholder="Search for a project…"
                        allOption="All Projects"
                        renderItem={p => ({ searchText: p.name, node: <div><div style={{ fontWeight: 600 }}>{p.name}</div></div> })}
                    />
                </div>
            </div>

            {loading ? <Loader /> : !projectFilter ? (
                <EmptyState icon="🔍" title="Select a project">
                    Choose a project above or select "All Projects" to view sprints.
                </EmptyState>
            ) : filtered.length === 0 ? (
                <EmptyState icon="🏃" title="No sprints found">
                    {sprints.length > 0 ? 'No sprints in this project.' : 'No sprints have been created yet.'}
                </EmptyState>
            ) : (
                <div className="board">
                    <div className="board-col">
                        <div className="board-col-header">
                            Planned <span className="count">{planned.length}</span>
                        </div>
                        <div className="board-col-body">
                            {planned.length === 0 ? (
                                <div className="board-col-empty">No sprints</div>
                            ) : planned.map(s => <SprintCard key={s.id} sprint={s} />)}
                        </div>
                    </div>
                    <div className="board-col">
                        <div className="board-col-header">
                            Active <span className="count">{active.length}</span>
                        </div>
                        <div className="board-col-body">
                            {active.length === 0 ? (
                                <div className="board-col-empty">No sprints</div>
                            ) : active.map(s => <SprintCard key={s.id} sprint={s} />)}
                        </div>
                    </div>
                    <div className="board-col">
                        <div className="board-col-header">
                            Completed <span className="count">{completed.length}</span>
                        </div>
                        <div className="board-col-body">
                            {completed.length === 0 ? (
                                <div className="board-col-empty">No sprints</div>
                            ) : completed.map(s => <SprintCard key={s.id} sprint={s} />)}
                        </div>
                    </div>
                </div>
            )}
        </Layout>
    );
};

export default SprintList;
