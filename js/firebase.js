// /js/firebase.js
const firebaseConfig = {
  apiKey: "AIzaSyAfHXM4qshjH5he-1BozPienm40W4szXY8",
  authDomain: "iglesia-restauracion-divina.firebaseapp.com",
  projectId: "iglesia-restauracion-divina",
  storageBucket: "iglesia-restauracion-divina.appspot.com",
  appId: "1:122940382710:web:3a1a3b7f47a5c563ebbbd7"
};

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, collection, addDoc, updateDoc, deleteDoc,
  query, orderBy, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
  getStorage, ref as sRef, uploadBytesResumable, getDownloadURL, deleteObject, listAll
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);
export const st   = getStorage(app);

// auth helpers
export const watchAuth = (cb)=> onAuthStateChanged(auth, cb);
export const login  = (email, pass)=> signInWithEmailAndPassword(auth, email, pass);
export const logout = ()=> signOut(auth);
export const resetPw = (email)=> sendPasswordResetEmail(auth, email);

// you are admin if a doc exists at /admins/{uid}
export async function isAdmin(uid){
  if (!uid) return false;
  const snap = await getDoc(doc(db, "admins", uid));
  return snap.exists();
}

// Events API for Manage page
export const EventsAPI = {
  liveQuery(cb){
    const q = query(collection(db, "events"), orderBy("date", "asc"));
    return onSnapshot(q, cb);
  },
  create(data){ return addDoc(collection(db, "events"), { ...data, image:"", createdAt: serverTimestamp() }); },
  update(id, data){ return updateDoc(doc(db, "events", id), data); },
  remove(id){ return deleteDoc(doc(db, "events", id)); },
  storage: {
    uploadFor(id, file){
      const ref = sRef(st, `events/${id}/${file.name}`);
      const task = uploadBytesResumable(ref, file, { contentType: file.type });
      return { task, ref };
    },
    getURL(ref){ return getDownloadURL(ref); },
    async removeFolder(id){
      const folder = sRef(st, `events/${id}`);
      const all = await listAll(folder);
      await Promise.all(all.items.map(item => deleteObject(item)));
    }
  }
};
