import { getAuth, signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";

function LogoutButton() {
    const navigate = useNavigate();
    const auth = getAuth(); // Or import the 'auth' instance from your config file

    const handleLogout = async () => {
        try {
            // 1. Tell Firebase to end the session
            await signOut(auth);

            // 2. Clear your local storage (if you were using it for simple email display)
            localStorage.removeItem('userEmail');

            // 3. Redirect to login
            navigate('/');
            console.log("Signed out successfully");
        } catch (error) {
            console.error("Error signing out: ", error.message);
        }
    };

    return (
        <button onClick={handleLogout} className="logout-btn" style={{ padding: '10px 20px', cursor: 'pointer', background: '#007bff', color: '#fff', border: 'none' }} >
            Logout
        </button>

    );
}

export default LogoutButton;