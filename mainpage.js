import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, query, where, onSnapshot, doc, updateDoc, deleteDoc, increment } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyCKDafA6zXmdqDU6Fd9gE434sW3CYT1dCE",
    authDomain: "origincard-f2676.firebaseapp.com",
    projectId: "origincard-f2676",
    storageBucket: "origincard-f2676.firebasestorage.app",
    messagingSenderId: "837946557108",
    appId: "1:837946557108:web:7b61c25ef8399473864de1"
};

// Firebase Başlatma
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);
const auth = getAuth(app);

let currentUser = null;

const elements = {
    grid: document.getElementById('collection-grid'),
    count: document.getElementById('total-card-count'),
    hp: document.getElementById('total-hp-value'),
    hc: document.getElementById('user-hc-balance'),
    navName: document.getElementById('nav-user-name'),
    popName: document.getElementById('popover-name'),
    logout: document.getElementById('nav-logout-btn'),
    // Modal Elemanları
    modal: document.getElementById('card-detail-modal'),
    mName: document.getElementById('m-card-name'),
    mRarity: document.getElementById('m-card-rarity'),
    mGen: document.getElementById('m-card-gen'),
    mPos: document.getElementById('m-card-pos'),
    mHp: document.getElementById('m-card-hp'),
    mValue: document.getElementById('m-card-value'),
    mHcPrice: document.getElementById('m-hc-price'),
    mCountry: document.getElementById('m-card-country'),
    mRender: document.getElementById('modal-card-render')
};

// --- YARDIMCI FONKSİYONLAR ---

// Sadece HC için: Sayıları binlik basamaklarına göre noktayla ayırır (Örn: 22800 -> 22.800)
function formatHC(number) {
    return Number(number).toLocaleString('tr-TR');
}

// --- OTURUM YÖNETİMİ ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        loadUserProfile(user); 
        loadUserCards(user.email);
    } else {
        window.location.href = "index.html";
    }
});

// --- PROFİL VERİLERİ GÜNCELLEME ---
async function loadUserProfile(user) {
    onSnapshot(doc(db, "users", user.uid), (snap) => {
        if (snap.exists()) {
            const userData = snap.data();
            console.log("Gelen Kullanıcı Verisi:", userData); // Burayı konsoldan kontrol et patron!

            // 1. İSİM GÜNCELLEME (Farklı ihtimalleri kontrol ediyoruz)
            // Firebase'de 'username' mi yoksa 'displayName' mi kullandığına göre bakar.
            const rawName = userData.username || userData.displayName || "Koleksiyoner";
            const upperName = rawName.toUpperCase();

            if (elements.navName) elements.navName.innerText = upperName;
            if (elements.popName) elements.popName.innerText = upperName;
            
            // 2. PARA GÜNCELLEME (Zaten çalışıyor demiştin)
            if (elements.hc) elements.hc.innerText = formatHC(userData.hc || 0);
            
            // 3. AVATAR GÜNCELLEME
            const defaultAvatar = "https://api.dicebear.com/7.x/notionists/svg?seed=Hasan&backgroundColor=1a1a1a";
            const avatarImg = document.getElementById('nav-avatar');
            if (avatarImg) {
                avatarImg.src = userData.photoURL || defaultAvatar;
                avatarImg.onerror = () => { avatarImg.src = defaultAvatar; };
            }
        }
    });
}

// --- KOLEKSİYON LİSTELEME ---
function loadUserCards(email) {
    const q = query(collection(db, "userCards"), where("ownerEmail", "==", email.toLowerCase()));

    onSnapshot(q, (snapshot) => {
        if (!elements.grid) return;
        elements.grid.innerHTML = "";
        let totalHp = 0;

        // EĞER KART YOKSA (Boş Durum Kontrolü)
        if (snapshot.empty) {
            elements.grid.innerHTML = `
                <div class="empty-state-card">
                    <div class="luxury-card-icon">
                        <div class="card-outline"></div>
                        <div class="card-sparkle"></div>
                    </div>
                    <h2>KASA MÜHÜRLÜ</h2>
                    <p>Bu kasanın sahibi henüz efsanesini başlatmadı. İlk nadir varlığını mühürlemek için markete geçiş yap.</p>
                    <a href="store.html" class="luxury-btn">PAZARI ZİYARET ET</a>
                </div>
            `;
            updateStats(0, 0);
            return;
        }

        snapshot.forEach((cardDoc) => {
            const data = { ...cardDoc.data(), id: cardDoc.id };
            totalHp += parseInt(data.hp) || 0;
            renderCard(data);
        });
        updateStats(snapshot.size, totalHp);
    });
}

function renderCard(data) {
    const rarityClass = data.rarity?.includes('LEGEND') ? 'legendary' : '';
    const lockIcon = data.isLocked ? '<div class="lock-tag" style="position:absolute; top:10px; right:10px; z-index:5;">🔒</div>' : '';
    
    const cardHTML = `
        <div class="card-item ${rarityClass}" id="card-${data.id}" style="cursor:pointer; position:relative;">
            ${lockIcon}
            <div class="card-glow"></div>
            <div class="card-content">
                <div class="card-image" style="background-image: url('${data.image || data.imageUrl}');"></div>
                <div class="card-info">
                    <span class="rarity">${data.rarity || 'STANDART'}</span>
                    <h3>${data.name}</h3>
                    <p>#${data.generalId || '000'}</p>
                </div>
            </div>
        </div>
    `;

    const div = document.createElement('div');
    div.innerHTML = cardHTML.trim();
    const node = div.firstChild;
    node.addEventListener('click', () => openCardDetail(data));
    elements.grid.appendChild(node);
}

// --- DETAY PANELİ (MODAL) ---
function openCardDetail(data) {
    elements.mName.innerText = data.name.toUpperCase();
    elements.mRarity.innerText = `${data.rarity || 'AA+ LEGEND'} | #${data.generalId || '000'}`;
    
    elements.mGen.innerText = data.gen || "0";
    elements.mPos.innerText = data.pos || "N/A";
    elements.mHp.innerText = data.hp || "0"; // HP'de nokta yok
    elements.mValue.innerText = data.value || "0M€";
    
    // HC Fiyatını noktalı formatta göster
    if(elements.mHcPrice) elements.mHcPrice.innerText = formatHC(data.hc || 0);
    if(elements.mCountry) elements.mCountry.innerText = data.nation || "TR";
    
    elements.mRender.innerHTML = `
        <div style="position:relative;">
            <img src="${data.image || data.imageUrl}" style="width: 100%; border-radius: 15px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
        </div>
    `;

    const quickPrice = Math.floor((data.hc || 0) * 0.7);
    const quickSellBtn = document.getElementById('btn-hizli-sat');
    const lockBtn = document.getElementById('btn-kilitle');
    const pazarBtn = document.getElementById('btn-pazara-sun');
    const deleteBtn = document.getElementById('btn-delete-record');

    if(deleteBtn) deleteBtn.innerText = "🗑️ KOLEKSİYONDAN ÇIKAR"; 
    // Hızlı satış fiyatı HC olduğu için noktayı buraya da ekledim
    quickSellBtn.innerText = `💰 HIZLI SAT (${formatHC(quickPrice)} HC)`;

    if (data.isLocked) {
        lockBtn.innerText = "🔓 KİLİDİ AÇ";
        quickSellBtn.disabled = true;
        pazarBtn.disabled = true;
        quickSellBtn.style.opacity = "0.5";
    } else {
        lockBtn.innerText = "🔒 KİLİTLE";
        quickSellBtn.disabled = false;
        pazarBtn.disabled = false;
        quickSellBtn.style.opacity = "1";
    }

    quickSellBtn.onclick = () => handleQuickSell(data, quickPrice);
    lockBtn.onclick = () => handleToggleLock(data);
    if(deleteBtn) deleteBtn.onclick = () => handleDeleteCard(data);
    pazarBtn.onclick = () => alert("Pazar sistemi yakında eklenecek!");

    elements.modal.style.display = 'flex';
}

// --- AKSİYON FONKSİYONLARI ---

async function handleQuickSell(data, price) {
    if (confirm(`${data.name} kartını ${formatHC(price)} HC karşılığında sisteme satmak istediğine emin misin?`)) {
        try {
            await deleteDoc(doc(db, "userCards", data.id));
            await updateDoc(doc(db, "users", currentUser.uid), {
                hc: increment(price)
            });
            elements.modal.style.display = 'none';
        } catch (err) {
            console.error("Satış hatası:", err);
        }
    }
}

async function handleToggleLock(data) {
    try {
        await updateDoc(doc(db, "userCards", data.id), {
            isLocked: !data.isLocked
        });
        elements.modal.style.display = 'none';
    } catch (err) {
        console.error("Kilitleme hatası:", err);
    }
}

async function handleDeleteCard(data) {
    if (confirm("Bu kartı koleksiyonunuzdan tamamen çıkarmak istediğinize emin misiniz?")) {
        try {
            await deleteDoc(doc(db, "userCards", data.id));
            elements.modal.style.display = 'none';
        } catch (err) {
            console.error("Silme hatası:", err);
        }
    }
}

document.getElementById('close-detail-modal').onclick = () => {
    elements.modal.style.display = 'none';
};

window.onclick = (event) => {
    if (event.target == elements.modal) {
        elements.modal.style.display = 'none';
    }
};

function updateStats(count, hp) {
    if (elements.count) elements.count.innerText = count;
    if (elements.hp) elements.hp.innerText = hp; // Üst bardaki HP'den noktayı kaldırdık
}

if (elements.logout) {
    elements.logout.onclick = (e) => {
        e.preventDefault();
        signOut(auth).then(() => window.location.href = "index.html");
    };
}