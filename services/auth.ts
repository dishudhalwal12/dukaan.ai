import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  User
} from "firebase/auth";
import { app } from "../firebase";

const auth = getAuth(app);

export const signUpWithEmail = async (email: string, password: string): Promise<User | null> => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  } catch (error) {
    console.warn("Firebase Auth Error (SignUp):", error);
    return null;
  }
};

export const signInWithEmail = async (email: string, password: string): Promise<User | null> => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  } catch (error) {
    console.warn("Firebase Auth Error (SignIn):", error);
    return null;
  }
};

export const signOutUser = async (): Promise<boolean> => {
  try {
    await signOut(auth);
    return true;
  } catch (error) {
    console.warn("Firebase Auth Error (SignOut):", error);
    return false;
  }
};

export const listenToAuthState = (callback: (user: User | null) => void) => {
  try {
    return onAuthStateChanged(auth, callback);
  } catch (error) {
    console.warn("Firebase Auth Error (Listen):", error);
    // Return a dummy unsubscribe function
    return () => {};
  }
};
