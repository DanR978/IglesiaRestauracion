// Single init shared everywhere
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAfHXM4qshjH5he-1BozPienm40W4szXY8",
  authDomain: "iglesia-restauracion-divina.firebaseapp.com",
  projectId: "iglesia-restauracion-divina",
  // optional for login page; fix later if you use Storage:
  storageBucket: "iglesia-restauracion-divina.appspot.com",
  appId: "1:122940382710:web:3a1a3b7f47a5c563ebbbd7",
  measurementId: "G-LMNPXN19Z2"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
