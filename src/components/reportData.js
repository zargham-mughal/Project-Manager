import { db } from '../firebase';
import { collection, getDocs, query, where, doc, updateDoc } from 'firebase/firestore';

// Auto-update sprint status based on its tasks:
// - All done → completed
// - At least one in-progress or done → active
// - Otherwise → planned
export const syncSprintStatus = async (orgId, projectId, sprintId) => {
    const tasksRef = collection(db, 'organizations', orgId, 'projects', projectId, 'sprints', sprintId, 'tasks');
    const snap = await getDocs(tasksRef);
    const tasks = snap.docs.map(d => d.data());

    let newStatus = 'planned';
    if (tasks.length > 0) {
        const allDone = tasks.every(t => t.status === 'done');
        const anyStarted = tasks.some(t => t.status === 'in-progress' || t.status === 'done');
        if (allDone) newStatus = 'completed';
        else if (anyStarted) newStatus = 'active';
    }

    const sprintRef = doc(db, 'organizations', orgId, 'projects', projectId, 'sprints', sprintId);
    await updateDoc(sprintRef, { status: newStatus });
};

// Fetch all projects for the org (used by reports / org views)
export const fetchAllProjects = async (orgId) => {
    const ref = collection(db, 'organizations', orgId, 'projects');
    const snapshot = await getDocs(ref);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
};

// Fetch all sprints across all projects for the org (org views)
export const fetchAllSprints = async (orgId, projects) => {
    const allSprints = [];
    for (const project of projects) {
        const ref = collection(db, 'organizations', orgId, 'projects', project.id, 'sprints');
        const snapshot = await getDocs(ref);
        snapshot.docs.forEach(d => {
            allSprints.push({ id: d.id, projectId: project.id, projectName: project.name, ...d.data() });
        });
    }
    return allSprints;
};

// Fetch all tasks across all sprints for the org (org views)
export const fetchAllTasks = async (orgId, sprints) => {
    const allTasks = [];
    for (const sprint of sprints) {
        const ref = collection(
            db, 'organizations', orgId, 'projects', sprint.projectId, 'sprints', sprint.id, 'tasks'
        );
        const snapshot = await getDocs(ref);
        snapshot.docs.forEach(d => {
            allTasks.push({
                id: d.id,
                sprintId: sprint.id,
                sprintName: sprint.name,
                projectId: sprint.projectId,
                projectName: sprint.projectName,
                ...d.data()
            });
        });
    }
    return allTasks;
};

// --- USER-SIDE FUNCTIONS ---
// These use a where() filter on assignedTo.uid so Firestore rules can
// validate the query (list queries with security rules require the
// query itself to be constrained to match the rule condition).

// Fetch all tasks assigned to a specific user across the entire org
export const fetchUserTasks = async (orgId, userId) => {
    const projects = await fetchAllProjects(orgId);
    const allTasks = [];

    for (const project of projects) {
        const sprintsRef = collection(db, 'organizations', orgId, 'projects', project.id, 'sprints');
        const sprintsSnap = await getDocs(sprintsRef);

        for (const sprintDoc of sprintsSnap.docs) {
            const tasksRef = collection(
                db, 'organizations', orgId, 'projects', project.id, 'sprints', sprintDoc.id, 'tasks'
            );
            const q = query(tasksRef, where('assignedTo.uid', '==', userId));
            const tasksSnap = await getDocs(q);

            tasksSnap.docs.forEach(d => {
                allTasks.push({
                    id: d.id,
                    sprintId: sprintDoc.id,
                    sprintName: sprintDoc.data().name,
                    projectId: project.id,
                    projectName: project.name,
                    ...d.data()
                });
            });
        }
    }

    return allTasks;
};

// Fetch all sprints that contain at least one task assigned to a user
export const fetchUserSprints = async (orgId, userId) => {
    const userTasks = await fetchUserTasks(orgId, userId);

    const seen = new Map();
    userTasks.forEach(t => {
        if (!seen.has(t.sprintId)) {
            seen.set(t.sprintId, {
                id: t.sprintId,
                name: t.sprintName,
                projectId: t.projectId,
                projectName: t.projectName,
            });
        }
    });

    // Fetch full sprint details (startDate, endDate, status) for each unique sprint
    const sprints = [];
    for (const { id, projectId } of seen.values()) {
        const sprintRef = collection(db, 'organizations', orgId, 'projects', projectId, 'sprints');
        const snap = await getDocs(sprintRef);
        const found = snap.docs.find(d => d.id === id);
        if (found) {
            const meta = seen.get(id);
            sprints.push({ ...meta, ...found.data() });
        }
    }

    return sprints;
};
