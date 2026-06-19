// Small shared UI primitives used across the app.

const initials = (text = '') => {
    const str = String(text).trim();
    if (!str) return '?';
    const parts = str.includes('@') ? [str[0]] : str.split(/\s+/);
    return parts.slice(0, 2).map(p => p[0]).join('').toUpperCase();
};

export const Avatar = ({ name, email, small }) => (
    <span className={`avatar ${small ? 'avatar-sm' : ''}`} title={name || email}>
        {initials(name || email)}
    </span>
);

export const Assignee = ({ user }) => {
    if (!user) return <span className="text-muted text-sm">Unassigned</span>;
    return (
        <span className="assignee">
            <Avatar name={user.name} email={user.email} small />
            <span>
                <span className="name">{user.name || user.email}</span>
            </span>
        </span>
    );
};

export const StatusBadge = ({ status }) => {
    const key = String(status || 'todo').toLowerCase().replace(/\s+/g, '-');
    const labels = {
        'todo': 'To Do',
        'in-progress': 'In Progress',
        'done': 'Done',
        'planned': 'Planned',
        'active': 'Active',
        'completed': 'Completed',
    };
    return <span className={`badge badge-${key}`}>{labels[key] || status}</span>;
};

export const Loader = ({ label = 'Loading…' }) => (
    <div className="loader-wrap">
        <div className="spinner" />
        <span>{label}</span>
    </div>
);

export const EmptyState = ({ icon = '📭', title, children }) => (
    <div className="empty">
        <div className="empty-icon">{icon}</div>
        {title && <div className="empty-title">{title}</div>}
        {children && <div className="text-sm">{children}</div>}
    </div>
);
