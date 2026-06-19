import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loader } from './ui';

const ProtectedRoute = ({ children, allowedRole }) => {
    const { currentUser, userRole, authLoading } = useAuth();

    if (authLoading) return <Loader label="Checking access…" />;

    if (!currentUser) return <Navigate to="/" replace />;

    const allowed = Array.isArray(allowedRole) ? allowedRole : [allowedRole];
    if (!allowed.includes(userRole)) return <Navigate to="/" replace />;

    return children;
};

export default ProtectedRoute;
