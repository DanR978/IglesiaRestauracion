import { auth, db } from "./firebase-core.js";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

// Sign in
export async function login(email, password) {
  const { user } = await signInWithEmailAndPassword(auth, email, password);
  return user;
}

// Reset password
export function resetPw(email) {
  return sendPasswordResetEmail(auth, email);
}

// Watch auth state
export function watchAuth(cb) {
  return onAuthStateChanged(auth, cb);
}

// ONE-TIME admin check (no listeners!)
export async function isAdmin(uid) {
  // Create this doc in Firestore: collection "adminUsers", doc id = UID, field { active: true }
  const snap = await getDoc(doc(db, "adminUsers", uid));
  return snap.exists() && snap.data()?.active === true;
}
