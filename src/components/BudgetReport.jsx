import './BudgetReport.css';
import { useState, useEffect, useRef } from 'react';
import { auth } from '../firebase';
import Layout from './Layout';
import { EmptyState, Loader } from './ui';
import { fetchAllProjects, fetchAllSprints, fetchAllTasks } from './reportData';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

const SearchableProjectSelect = ({ projects, selectedProjectId, onSelect }) => {
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

    const filtered = projects.filter(p =>
        (p.name || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const selectedProject = projects.find(p => p.id === selectedProjectId);

    return (
        <div className="searchable-select" ref={wrapRef}>
            <div className="searchable-select-input-wrap">
                <span className="searchable-select-icon">🔍</span>
                <input
                    className="input searchable-select-input"
                    type="text"
                    placeholder="Search for a project…"
                    value={searchTerm}
                    onKeyDown={e => { if (/[0-9]/.test(e.key)) e.preventDefault(); }}
                    onChange={e => { setSearchTerm(e.target.value.replace(/[0-9]/g, '')); setIsOpen(true); }}
                    onFocus={() => setIsOpen(true)}
                />
                {selectedProject && !isOpen && (
                    <div className="searchable-select-selected" onClick={() => { setSearchTerm(''); setIsOpen(true); }}>
                        <span style={{ fontWeight: 600 }}>{selectedProject.name}</span>
                        <button className="searchable-select-clear" onClick={e => { e.stopPropagation(); onSelect(null); setSearchTerm(''); }}>✕</button>
                    </div>
                )}
            </div>
            {isOpen && (
                <div className="searchable-select-dropdown">
                    {filtered.length === 0 ? (
                        <div className="searchable-select-empty">No matching projects found</div>
                    ) : (
                        filtered.map(p => (
                            <button
                                key={p.id}
                                className={`searchable-select-option ${selectedProjectId === p.id ? 'active' : ''}`}
                                onClick={() => { onSelect(p.id); setIsOpen(false); setSearchTerm(''); }}
                            >
                                <div>
                                    <div style={{ fontWeight: 600 }}>{p.name}</div>
                                    <div className="text-sm text-muted">${p.budget?.toLocaleString() || 0} budget</div>
                                </div>
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

const BudgetReport = () => {
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedProjectId, setSelectedProjectId] = useState(null);
    const [projectDetails, setProjectDetails] = useState({});
    const orgUser = auth.currentUser;

    useEffect(() => {
        const load = async () => {
            const data = await fetchAllProjects(orgUser.uid);
            setProjects(data);

            const sprints = await fetchAllSprints(orgUser.uid, data);
            const tasks = await fetchAllTasks(orgUser.uid, sprints);

            const { getDocs, collection, query, where } = await import('firebase/firestore');
            const { db } = await import('../firebase');
            const usersSnap = await getDocs(
                query(collection(db, 'users'), where('createdBy', '==', orgUser.uid))
            );
            const rateMap = {};
            usersSnap.docs.forEach(d => { rateMap[d.id] = d.data().hourlyRate || 0; });

            const details = {};
            data.forEach(p => { details[p.id] = { budget: p.budget || 0, spent: 0 }; });
            tasks.forEach(t => {
                const rate = rateMap[t.assignedTo?.uid] || 0;
                const cost = (t.actualHours || 0) * rate;
                if (details[t.projectId]) details[t.projectId].spent += cost;
            });

            setProjectDetails(details);
            setLoading(false);
        };
        load();
    }, []);

    const selectedProject = projects.find(p => p.id === selectedProjectId);
    const detail = selectedProjectId ? projectDetails[selectedProjectId] : null;

    return (
        <Layout role="org" crumbs={[{ label: 'Dashboard', to: '/orghome' }, { label: 'Budget Report' }]}>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Budget Report</h1>
                    <p className="page-subtitle">Search for a project to view its budget breakdown</p>
                </div>
            </div>

            {loading ? (
                <Loader />
            ) : projects.length === 0 ? (
                <EmptyState icon="💰" title="No projects yet">Create projects to see budget analytics.</EmptyState>
            ) : (
                <>
                    <div className="mb-24">
                        <SearchableProjectSelect
                            projects={projects}
                            selectedProjectId={selectedProjectId}
                            onSelect={setSelectedProjectId}
                        />
                    </div>

                    {selectedProject && detail ? (
                        <>
                            <div className="stat-grid">
                                <div className="stat-card">
                                    <div className="stat-label">Budget</div>
                                    <div className="stat-value">${detail.budget.toLocaleString()}</div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-label">Spent</div>
                                    <div className="stat-value danger">${detail.spent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-label">Remaining</div>
                                    <div className="stat-value success">${(detail.budget - detail.spent).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                </div>
                            </div>

                            <div className="chart-card mb-24">
                                <h3 className="card-title mb-16">Budget vs. Spent — {selectedProject.name}</h3>
                                <div style={{ width: '100%', height: 340 }}>
                                    <ResponsiveContainer>
                                        <BarChart data={[{ name: selectedProject.name, Budget: detail.budget, Spent: parseFloat(detail.spent.toFixed(2)) }]}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                                            <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                                            <YAxis tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                                            <Tooltip formatter={(v) => `$${v.toLocaleString()}`} />
                                            <Legend />
                                            <Bar dataKey="Budget" fill="#0052cc" radius={[4, 4, 0, 0]} />
                                            <Bar dataKey="Spent" fill="#de350b" radius={[4, 4, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </>
                    ) : (
                        <EmptyState icon="🔍" title="Search for a project">
                            Type a project name above to view its budget report.
                        </EmptyState>
                    )}
                </>
            )}
        </Layout>
    );
};

export default BudgetReport;
