import { createContext, useContext, useState } from 'react';

const SelectedUserContext = createContext();

export const SelectedUserProvider = ({ children }) => {
    const [selectedUser, setSelectedUser] = useState(null); // { id, name, email, hourlyRate, shiftHours }

    return (
        <SelectedUserContext.Provider value={{ selectedUser, setSelectedUser }}>
            {children}
        </SelectedUserContext.Provider>
    );
};

export const useSelectedUser = () => useContext(SelectedUserContext);
