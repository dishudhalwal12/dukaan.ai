import { doc, setDoc, getDoc } from "firebase/firestore";
import { db } from "../firebase";

/**
 * Safely saves the business profile to Firestore without blocking the UI.
 * Fails silently by returning early or catching errors to ensure the app continues working.
 */
export const saveBusinessProfileToCloud = async (storeName: string, profileData: any): Promise<void> => {
  try {
    if (!storeName || !profileData) return;

    // Use the storeName as the document ID for simplicity, or a slugified version.
    const docId = storeName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    
    // Merge: true ensures it updates existing fields rather than overwriting the whole document destructively
    await setDoc(doc(db, "businessProfiles", docId), profileData, { merge: true });
    console.log("Business profile synced to cloud.");
  } catch (error) {
    // Silently fallback - Firebase is additive only. 
    console.warn("Failed to sync profile to cloud. Continuing with local data.", error);
  }
};

/**
 * Safely fetches a business profile from Firestore.
 * Returns null if it fails or doesn't exist.
 */
export const fetchBusinessProfileFromCloud = async (storeName: string): Promise<any | null> => {
  try {
    if (!storeName) return null;

    const docId = storeName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    const docSnap = await getDoc(doc(db, "businessProfiles", docId));

    if (docSnap.exists()) {
      return docSnap.data();
    } else {
      return null;
    }
  } catch (error) {
    // Silently fallback
    console.warn("Failed to fetch profile from cloud. Continuing with local data.", error);
    return null;
  }
};
