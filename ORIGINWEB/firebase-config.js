// Firebase SDK'larını içe aktarıyoruz
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Senin Firebase konsolundan aldığın özel bilgiler
const firebaseConfig = {
  apiKey: "AIzaSyCKDafA6zXmdqDU6Fd9gE434sW3CYT1dCE",
  authDomain: "origincard-f2676.firebaseapp.com",
  projectId: "origincard-f2676",
  storageBucket: "origincard-f2676.firebasestorage.app",
  messagingSenderId: "837946557108",
  appId: "1:837946557108:web:7b61c25ef8399473864de1",
  measurementId: "G-WHPE66ENDP"
};

// Firebase'i başlatıyoruz
const app = initializeApp(firebaseConfig);

// Diğer dosyalarda kullanabilmek için 'export' (dışa aktar) yapıyoruz
export const auth = getAuth(app);
export const db = getFirestore(app);