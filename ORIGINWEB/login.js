import { auth } from "./firebase-config.js";
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const loginForm = document.getElementById('login-form');

loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    // Formdan verileri alıyoruz
    const email = loginForm.querySelector('input[type="email"]').value;
    const password = loginForm.querySelector('input[type="password"]').value;

    // Firebase ile giriş yapıyoruz
    signInWithEmailAndPassword(auth, email, password)
        .then((userCredential) => {
            alert("Tekrar hoş geldin, koleksiyoncu!");
            window.location.href = "index.html"; 
        })
        .catch((error) => {
            alert("Giriş hatası: " + error.message);
        });
});