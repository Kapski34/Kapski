import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// TODO: Zastąp poniższe dane swoimi danymi z konsoli Firebase:
// 1. Wejdź na https://console.firebase.google.com/
// 2. Stwórz projekt -> Project Settings -> General -> Your apps -> Add Web App
// 3. Skopiuj obiekt 'firebaseConfig'
const firebaseConfig = {
  apiKey: "TU_WKLEJ_API_KEY",
  authDomain: "twoj-projekt.firebaseapp.com",
  projectId: "twoj-projekt",
  storageBucket: "twoj-projekt.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};

// Initialize Firebase only if config is present to avoid crash on empty template
let app;
let auth;
let db;
let googleProvider;

try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    googleProvider = new GoogleAuthProvider();
} catch (e) {
    console.warn("Firebase nie został poprawnie skonfigurowany. Uzupełnij plik firebaseConfig.ts");
}

export { auth, db, googleProvider };