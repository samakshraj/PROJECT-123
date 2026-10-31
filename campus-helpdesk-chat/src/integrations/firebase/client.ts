import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyA2A9cFBwq4y5IiY1dYJH4BST259ri1BeY",
  authDomain: "samaksh-48fcd.firebaseapp.com",
  projectId: "samaksh-48fcd",
  storageBucket: "samaksh-48fcd.firebasestorage.app",
  messagingSenderId: "919533922968",
  appId: "1:919533922968:web:2016395477124cf15afeed",
  measurementId: "G-RQ56NWEB9H",
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
export const googleProvider = new GoogleAuthProvider();
