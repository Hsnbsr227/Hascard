import { auth } from "./firebase-config.js";
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const registerForm = document.getElementById('register-form');

registerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    // Inputları sırasına göre değil, tipine göre yakalamak daha güvenlidir
    const email = registerForm.querySelector('input[type="email"]').value;
    const password = registerForm.querySelector('input[type="password"]').value;
    const username = registerForm.querySelector('input[type="text"]').value;

    createUserWithEmailAndPassword(auth, email, password)
        .then((userCredential) => {
            alert(`Hoş geldin ${username}! ORIGIN CARDS koleksiyonun başlıyor.`);
            window.location.href = "index.html"; 
        })
        .catch((error) => {
            // Hataları daha anlaşılır göstermek için
            if (error.code === 'auth/weak-password') {
                alert("Şifre çok zayıf (en az 6 karakter olmalı).");
            } else if (error.code === 'auth/email-already-in-use') {
                alert("Bu e-posta zaten kullanımda.");
            } else {
                alert("Hata: " + error.message);
            }
        });
});