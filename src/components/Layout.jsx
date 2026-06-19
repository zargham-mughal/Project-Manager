import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { getAuth, signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { Avatar } from './ui';
import { useTheme } from '../context/ThemeContext';
import './Layout.css';

const ORG_NAV = [
    { to: '/orghome', icon: '▦', label: 'Dashboard' },
    { to: '/projects', icon: '📁', label: 'Projects' },
    { to: '/sprints', icon: '🏃', label: 'Sprints' },
    { to: '/tasks', icon: '📝', label: 'Tasks' },
    { to: '/create-user', icon: '👥', label: 'Team' },
    { to: '/reports/budget', icon: '💰', label: 'Budget Report' },
    { to: '/reports/users', icon: '📊', label: 'User Report' },
];

const USER_NAV = [
    { to: '/userhome', icon: '▦', label: 'Dashboard' },
    { to: '/sprints', icon: '🏃', label: 'Sprints' },
    { to: '/tasks', icon: '📝', label: 'Tasks' },
];

const ThemeToggle = () => {
    const { theme, toggleTheme } = useTheme();
    const isDark = theme === 'dark';
    return (
        <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme">
            {isDark ? '🌙' : '☀️'}
            <div className={`toggle-track ${isDark ? 'on' : ''}`}>
                <div className="toggle-knob" />
            </div>
        </button>
    );
};

const Layout = ({ role = 'org', crumbs = [], children }) => {
    const location = useLocation();
    const navigate = useNavigate();
    const user = auth.currentUser;
    const nav = role === 'org' ? ORG_NAV : USER_NAV;
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const isActive = (to) =>
        location.pathname === to ||
        (to !== '/orghome' && to !== '/userhome' && location.pathname.startsWith(to));

    const handleLogout = async () => {
        try {
            await signOut(getAuth());
            localStorage.removeItem('userEmail');
            navigate('/');
        } catch (err) {
            console.error('Error signing out:', err.message);
        }
    };

    const closeSidebar = () => setSidebarOpen(false);

    return (
        <div className="app-shell">
            <div className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`} onClick={closeSidebar} />

            <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
                <div className="sidebar-brand">
                    <span className="logo-mark">✓</span>
                    <span>TaskFlow</span>
                </div>

                <nav className="nav">
                    <div className="nav-section">{role === 'org' ? 'Workspace' : 'Menu'}</div>
                    {nav.map(item => (
                        <Link
                            key={item.to}
                            to={item.to}
                            className={`nav-item ${isActive(item.to) ? 'active' : ''}`}
                            onClick={closeSidebar}
                        >
                            <span className="nav-icon">{item.icon}</span>
                            {item.label}
                        </Link>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    <div className="sidebar-user">
                        <Avatar email={user?.email} name={user?.displayName} />
                        <div className="meta">
                            <div className="name">{user?.email}</div>
                            <div className="role">{role === 'org' ? 'Organization' : 'Team Member'}</div>
                        </div>
                    </div>
                    <button className="btn btn-ghost btn-block btn-sm" onClick={handleLogout}>
                        ↪ Sign out
                    </button>
                </div>
            </aside>

            <div className="main">
                <header className="topbar">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <button className="hamburger-btn" onClick={() => setSidebarOpen(o => !o)}>
                            ☰
                        </button>
                        <div className="crumbs">
                            {crumbs.length === 0 ? (
                                <span>TaskFlow</span>
                            ) : (
                                crumbs.map((c, i) => (
                                    <React.Fragment key={i}>
                                        {i > 0 && <span className="sep">/</span>}
                                        {c.to ? <Link to={c.to}>{c.label}</Link> : <span>{c.label}</span>}
                                    </React.Fragment>
                                ))
                            )}
                        </div>
                    </div>
                    <div className="topbar-actions">
                        <ThemeToggle />
                    </div>
                </header>

                <main className="content">{children}</main>
            </div>
        </div>
    );
};

export default Layout;
