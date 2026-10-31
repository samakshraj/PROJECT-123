// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyA2A9cFBwq4y5IiY1dYJH4BST259ri1BeY",
  authDomain: "samaksh-48fcd.firebaseapp.com",
  projectId: "samaksh-48fcd",
  storageBucket: "samaksh-48fcd.firebasestorage.app",
  messagingSenderId: "919533922968",
  appId: "1:919533922968:web:2016395477124cf15afeed",
  measurementId: "G-RQ56NWEB9H",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
if (typeof window !== "undefined") {
  void isSupported().then((supported) => {
    if (supported) {
      getAnalytics(app);
    }
  });
}
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
