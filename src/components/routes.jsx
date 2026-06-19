import { Routes, Route } from "react-router-dom";
import Signup from "./signup";
import Login from "./login";
import OrgHome from "./orghome";
import UserHome from "./Userhome";
import CreateUser from "./CreateUser";
import ProjectList from "./ProjectList";
import ProjectDetail from "./ProjectDetail";
import SprintDetail from "./SprintDetail";
import SprintList from "./SprintList";
import TaskList from "./TaskList";
import BudgetReport from "./BudgetReport";
import UserReport from "./UserReport";
import ProtectedRoute from "./ProtectedRoute";

const Routing = () => {
    return (
        <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/signup" element={<Signup />} />

            <Route path="/orghome" element={
                <ProtectedRoute allowedRole="org">
                    <OrgHome />
                </ProtectedRoute>
            } />

            <Route path="/userhome" element={
                <ProtectedRoute allowedRole="user">
                    <UserHome />
                </ProtectedRoute>
            } />

            <Route path="/create-user" element={
                <ProtectedRoute allowedRole="org">
                    <CreateUser />
                </ProtectedRoute>
            } />

            <Route path="/projects" element={
                <ProtectedRoute allowedRole="org">
                    <ProjectList />
                </ProtectedRoute>
            } />

            <Route path="/projects/:projectId" element={
                <ProtectedRoute allowedRole="org">
                    <ProjectDetail />
                </ProtectedRoute>
            } />

            <Route path="/projects/:projectId/sprints/:sprintId" element={
                <ProtectedRoute allowedRole="org">
                    <SprintDetail />
                </ProtectedRoute>
            } />

            <Route path="/sprints" element={
                <ProtectedRoute allowedRole={["org", "user"]}>
                    <SprintList />
                </ProtectedRoute>
            } />

            <Route path="/tasks" element={
                <ProtectedRoute allowedRole={["org", "user"]}>
                    <TaskList />
                </ProtectedRoute>
            } />

            <Route path="/reports/budget" element={
                <ProtectedRoute allowedRole="org">
                    <BudgetReport />
                </ProtectedRoute>
            } />

            <Route path="/reports/users" element={
                <ProtectedRoute allowedRole="org">
                    <UserReport />
                </ProtectedRoute>
            } />
        </Routes>
    );
};

export default Routing;
