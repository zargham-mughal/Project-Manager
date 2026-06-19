// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from 'firebase/firestore';
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyA_sB76Q-Nh--FjdEiZtzABQastIlQF5Fs",
    authDomain: "taskmanager-a4999.firebaseapp.com",
    projectId: "taskmanager-a4999",
    storageBucket: "taskmanager-a4999.firebasestorage.app",
    messagingSenderId: "576972671309",
    appId: "1:576972671309:web:b4281b7008d1b22ee84f04",
    measurementId: "G-WPGC7MT5RF"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
export const auth = getAuth(app);
export const db = getFirestore(app);