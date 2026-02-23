import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- FIREBASE YAPILANDIRMASI ---
const firebaseConfig = {
    apiKey: "AIzaSyCKDafA6zXmdqDU6Fd9gE434sW3CYT1dCE",
    authDomain: "origincard-f2676.firebaseapp.com",
    projectId: "origincard-f2676",
    storageBucket: "origincard-f2676.firebasestorage.app",
    messagingSenderId: "837946557108",
    appId: "1:837946557108:web:7b61c25ef8399473864de1",
    measurementId: "G-WHPE66ENDP"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- [FONKSİYON] ŞIK BİLDİRİM (TOAST) SİSTEMİ ---
window.showToast = function(message, icon = 'check_circle') {
    const container = document.getElementById('toast-container');
    if (!container) return; 

    const toast = document.createElement('div');
    toast.className = 'toast-message';
    toast.innerHTML = `
        <span class="material-symbols-outlined toast-icon">${icon}</span>
        <div><p style="font-size: 13px; font-weight: 600; margin:0; color:#fff;">${message}</p></div>
    `;

    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('toast-fade-out');
        setTimeout(() => toast.remove(), 500);
    }, 4000);
};

// --- [FONKSİYON] KARTLARI VE TOPLAM HP DEĞERİNİ YÜKLE ---
async function loadUserCards() {
    const grid = document.getElementById('collection-grid');
    if (!grid) return;

    const user = auth.currentUser;
    if (!user) return; 

    try {
        const q = query(collection(db, "userCards"), where("ownerId", "==", user.uid));
        const querySnapshot = await getDocs(q);
        
        grid.innerHTML = ''; 
        let totalHP = 0; 

        if (querySnapshot.empty) {
            grid.innerHTML = '<p style="color: #444; font-size: 14px; grid-column: 1/-1; text-align: center; padding: 50px;">Henüz koleksiyonunda kart bulunmuyor.</p>';
        } else {
            querySnapshot.forEach((doc) => {
                const card = doc.data();
                totalHP += Number(card.price || 0);

                const cardHTML = `
                    <div class="card-item animate__animated animate__fadeIn">
                        <div class="card-content">
                            <div class="card-image" style="background-image: url('${card.imageUrl}');"></div>
                            <div class="card-info">
                                <span class="rarity">${card.rarity}</span>
                                <h3>${card.name}</h3>
                                <p>#${card.generalId}</p>
                                <div class="card-stats-mini">
                                     <span>Seri: ${card.limitedNo} / ${card.maxSupply}</span>
                                     ${card.price > 0 ? `<span class="price-tag">${card.price} HP</span>` : ''}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                grid.innerHTML += cardHTML;
            });
        }

        const countEl = document.getElementById('total-card-count');
        const hpEl = document.getElementById('total-hp-value');
        if (countEl) countEl.innerText = querySnapshot.size;
        if (hpEl) hpEl.innerText = totalHP.toLocaleString();

    } catch (error) {
        console.error("Kartlar yüklenemedi:", error);
    }
}

// --- GİRİŞ/KAYIT BAŞARI EKRANLARI ---
function showLoginSuccess(userName) {
    const authBox = document.querySelector('.auth-box');
    if (authBox) {
        authBox.innerHTML = `<div style="text-align:center; padding:50px;"><h2 style="color:#fff;">ERİŞİM ONAYLANDI...</h2></div>`;
        setTimeout(() => { window.location.href = "loading.html"; }, 1000);
    }
}

function showRegisterSuccess(userName) {
    const authBox = document.querySelector('.auth-box');
    if (authBox) {
        authBox.innerHTML = `<div style="text-align:center; padding:50px;"><h2 style="color:#fff;">KİMLİK OLUŞTURULDU...</h2></div>`;
        setTimeout(() => { window.location.href = "loading.html"; }, 1000);
    }
}

// --- KAYIT VE GİRİŞ EVENTLERİ ---
const registerForm = document.getElementById('register-form');
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('reg-name').value;
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, document.getElementById('reg-email').value, document.getElementById('reg-password').value);
            await setDoc(doc(db, "users", userCredential.user.uid), { 
                displayName: name, hc: 65, joinedDate: new Date(), role: "collector" 
            });
            showRegisterSuccess(name);
        } catch (error) { alert(error.message); }
    });
}

const loginForm = document.getElementById('login-form');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await signInWithEmailAndPassword(auth, document.getElementById('login-email').value, document.getElementById('login-password').value);
            showLoginSuccess();
        } catch (error) { alert("Hata: " + error.message); }
    });
}

// --- [KRİTİK] DURUM KONTROLÜ VE MAINPAGE TETİKLEYİCİ ---
onAuthStateChanged(auth, async (user) => {
    const currentPage = window.location.pathname;

    if (user) {
        if (currentPage.endsWith("index.html") || currentPage === "/") {
            window.location.href = "mainpage.html";
            return;
        }

        loadUserCards(); // Kartları yükle

        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
            const userData = userDoc.data();
            const firstName = userData.displayName.split(' ')[0].toUpperCase();
            
            // UI Güncellemeleri
            const hcDisplay = document.getElementById('user-hc-balance');
            if(hcDisplay) hcDisplay.innerText = (userData.hc || 0).toLocaleString();
            
            const navUserName = document.getElementById('nav-user-name');
            if(navUserName) navUserName.innerText = firstName;

            const popoverName = document.getElementById('popover-name');
            if(popoverName) popoverName.innerText = firstName;

            // --- İŞTE BURADA: MAINPAGE AÇILINCA BİLDİRİM GÖNDER ---
            if (currentPage.includes("mainpage.html")) {
                setTimeout(() => {
                    window.showToast(`SİSTEM AKTİF: ${firstName}`, 'shield_person');
                }, 1500);
            }
        }
    } else {
        if (currentPage.includes("mainpage.html") || currentPage.includes("loading.html")) { 
            window.location.href = "index.html"; 
        }
    }
});

// --- ÇIKIŞ ---
const logoutBtn = document.getElementById('nav-logout-btn');
if(logoutBtn) {
    logoutBtn.onclick = async () => {
        await signOut(auth);
        window.location.href = "index.html";
    };
}