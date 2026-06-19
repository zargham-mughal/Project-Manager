import { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

// Reusable dropdown to select a user created by this org
// onChange receives { uid, name, email } or null
const UserSelect = ({ value, onChange }) => {
    const [users, setUsers] = useState([]);
    const orgUser = auth.currentUser;

    useEffect(() => {
        const fetchUsers = async () => {
            if (!orgUser) return;
            const q = query(
                collection(db, 'users'),
                where('createdBy', '==', orgUser.uid)
            );
            const snapshot = await getDocs(q);
            const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setUsers(list);
        };
        fetchUsers();
    }, []);

    const handleChange = (e) => {
        const uid = e.target.value;
        if (!uid) {
            onChange(null);
            return;
        }
        const selected = users.find(u => u.id === uid);
        onChange({ uid: selected.id, name: selected.name, email: selected.email });
    };

    return (
        <select className="select" value={value?.uid || ''} onChange={handleChange}>
            <option value="">— Unassigned —</option>
            {users.map(u => (
                <option key={u.id} value={u.id}>
                    {u.name} ({u.email})
                </option>
            ))}
        </select>
    );
};

export default UserSelect;
