// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCaZdPPYddeMPTiNm5cCdFL6m9b9swX0-c",
  authDomain: "williantaller-1426b.firebaseapp.com",
  projectId: "williantaller-1426b",
  storageBucket: "williantaller-1426b.firebasestorage.app",
  messagingSenderId: "757966587061",
  appId: "1:757966587061:web:6c700e862317119d64aafc"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
