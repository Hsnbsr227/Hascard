import { auth } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const userProfile = document.getElementById('user-profile');
const navRegisterBtn = document.getElementById('nav-register-btn');
const userInitial = document.getElementById('user-initial');
const userEmailDisplay = document.getElementById('user-email-display');
const logoutBtn = document.getElementById('logout-btn');

onAuthStateChanged(auth, (user) => {
    if (user) {
        // Giriş Yapılmışsa
        navRegisterBtn.style.display = 'none';
        userProfile.style.display = 'block';
        
        // E-postanın ilk harfini ikona koyalım (Elite dokunuş)
        userInitial.innerText = user.email.charAt(0).toUpperCase();
        userEmailDisplay.innerText = user.email;

    } else {
        // Çıkış Yapılmışsa
        navRegisterBtn.style.display = 'block';
        userProfile.style.display = 'none';
    }
});

// Çıkış Yapma İşlemi
logoutBtn.addEventListener('click', (e) => {
    e.preventDefault();
    signOut(auth).then(() => {
        alert("Güvenli çıkış yapıldı. Tekrar bekleriz!");
        window.location.reload(); // Sayfayı yenileyerek sistemi sıfırla
    }).catch((error) => {
        console.error("Çıkış hatası:", error);
    });
});