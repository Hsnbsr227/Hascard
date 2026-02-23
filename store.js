import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, onSnapshot, collection, getDocs, getDoc, runTransaction } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyCKDafA6zXmdqDU6Fd9gE434sW3CYT1dCE",
    authDomain: "origincard-f2676.firebaseapp.com",
    projectId: "origincard-f2676",
    storageBucket: "origincard-f2676.firebasestorage.app",
    messagingSenderId: "837946557108",
    appId: "1:837946557108:web:7b61c25ef8399473864de1"
};

// --- FIREBASE BAŞLATMA ---
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);
const auth = getAuth(app);

let currentUser = null;

// --- ELEMENT YÖNETİMİ ---
const elements = {
    hc: document.getElementById('user-hc-balance'),
    navName: document.getElementById('nav-user-name'),
    popName: document.getElementById('popover-name'),
    logout: document.getElementById('nav-logout-btn'),
    navAvatar: document.getElementById('nav-avatar'),
    profileTrigger: document.getElementById('profile-trigger'),
    profilePopover: document.getElementById('profile-popover'),
    coinContainer: document.getElementById('coin-packages'),
    packContainer: document.querySelector('.package-display'),
    inspectModal: document.getElementById('inspect-modal')
};

const coinPackages = [
    { amount: 60, price: '19.99 TL' },
    { amount: 150, price: '44.99 TL' },
    { amount: 380, price: '99.99 TL' },
    { amount: 720, price: '189.99 TL' },
    { amount: 1850, price: '449.99 TL' },
    { amount: 3000, price: '699.99 TL' }
];

// --- YARDIMCI FONKSİYONLAR ---
function formatHC(number) {
    return Number(number).toLocaleString('tr-TR');
}

// --- MARKET RENDER MOTORU ---

function renderCoinPackages() {
    if (!elements.coinContainer) return;
    elements.coinContainer.innerHTML = coinPackages.map(pkg => `
        <div class="coin-card">
            <div class="coin-icon-wrapper">
                <span class="material-symbols-outlined icon-green">payments</span>
            </div>
            <span class="hc-amount">${pkg.amount}</span>
            <span class="hc-label">HAS COIN</span>
            <button class="buy-btn" onclick="window.handlePurchase('${pkg.amount}')">${pkg.price}</button>
        </div>
    `).join('');
}

async function renderMarketPacks() {
    if (!elements.packContainer) return;

    try {
        const packsSnap = await getDocs(collection(db, "packs"));
        elements.packContainer.innerHTML = ""; 

        packsSnap.forEach((docSnap) => {
            const pack = docSnap.data();
            const packId = docSnap.id;

            elements.packContainer.innerHTML += `
                <div class="vertical-pack-card">
                    <div class="pack-badge">YENİ</div>
                    <div class="pack-visual">
                        <img src="${pack.packImg}" alt="${pack.name}">
                    </div>
                    <div class="pack-details">
                        <h3>${pack.name}</h3>
                        <div class="pack-price-tag">
                            <span class="material-symbols-outlined">payments</span>
                            <span>${pack.price} HC</span>
                        </div>
                        <div class="pack-actions">
                            <button class="inspect-btn" onclick="window.openPackInspect('${packId}')">PAKETİ İNCELE</button>
                            <button class="buy-pack-btn" onclick="window.purchasePack('${packId}', ${pack.price})">MÜHÜRLE</button>
                        </div>
                    </div>
                </div>
            `;
        });
    } catch (error) {
        console.error("Paket yükleme hatası:", error);
    }
}

// --- MÜHÜRLEME (SATIN ALMA) SİSTEMİ - HATA DÜZELTİLMİŞ ---
window.purchasePack = async (packId, price) => {
    if (!currentUser) {
        alert("Önce giriş yapmalısın patron!");
        return;
    }

    const confirmPurchase = confirm(`${price} HC karşılığında bu paketi mühürlemek istediğine emin misin?`);
    if (!confirmPurchase) return;

    try {
        await runTransaction(db, async (transaction) => {
            // 1. ADIM: TÜM OKUMALARI YAP (READS FIRST)
            const userRef = doc(db, "users", currentUser.uid);
            const packRef = doc(db, "packs", packId);

            const userSnap = await transaction.get(userRef);
            const packSnap = await transaction.get(packRef);

            if (!userSnap.exists()) throw "Kullanıcı verisi bulunamadı!";
            if (!packSnap.exists()) throw "Paket verisi bulunamadı!";

            const userData = userSnap.data();
            const packData = packSnap.data();
            const currentHC = userData.hc || 0;

            // Bakiye Kontrolü
            if (currentHC < price) {
                throw "Yetersiz HC! Marketten takviye yapmalısın.";
            }

            // 2. ADIM: TÜM YAZMALARI YAP (WRITES LAST)
            // HC Düşürme
            transaction.update(userRef, { hc: currentHC - price });

            // Kartları envantere ekle
            packData.content.forEach(cardId => {
                const newCardRef = doc(collection(db, "userCards")); 
                transaction.set(newCardRef, {
                    userId: currentUser.uid,
                    cardId: cardId.trim(),
                    obtainedAt: new Date(),
                    source: packData.name
                });
            });
        });

        alert("Mühür başarıyla kırıldı! Kartlar envanterine eklendi.");

    } catch (error) {
        alert("İşlem başarısız: " + error);
        console.error("Satın alma hatası:", error);
    }
};

// --- İNCELEME VE DETAY ---
window.openPackInspect = async (packId) => {
    const modal = elements.inspectModal;
    if (!modal) return;

    try {
        const packRef = doc(db, "packs", packId);
        const packSnap = await getDoc(packRef);
        
        if (packSnap.exists()) {
            const pack = packSnap.data();
            const cardGrid = modal.querySelector('.possible-cards-grid');
            
            modal.querySelector('.inspect-header h2').innerText = pack.name;
            modal.querySelector('.floating-pack').src = pack.packImg;
            
            cardGrid.innerHTML = `<p style="color: #4caf50;">Kartlar hazırlanıyor...</p>`;
            modal.style.display = 'flex';

            const cardPromises = pack.content.map(id => getDoc(doc(db, "allCards", id.trim())));
            const cardsData = await Promise.all(cardPromises);
            
            cardGrid.innerHTML = cardsData.map(c => {
                if (!c.exists()) return '';
                const data = c.data();
                return `
                    <div class="mini-card-slot" onclick="window.showCardDetail('${c.id}')">
                        <img src="${data.imageUrl}" alt="Kart">
                    </div>
                `;
            }).join('');
        }
    } catch (error) {
        console.error("İnceleme hatası:", error);
    }
};

window.showCardDetail = async (cardId) => {
    const cardRef = doc(db, "allCards", cardId);
    const cardSnap = await getDoc(cardRef);
    if (cardSnap.exists()) {
        const data = cardSnap.data();
        alert(`Oyuncu: ${data.name}\nGen: ${data.gen}\nPozisyon: ${data.pos}`);
    }
};

// --- OTURUM VE VERİ YÖNETİMİ ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        loadUserProfile(user); 
        renderCoinPackages();
        renderMarketPacks();
    } else {
        window.location.href = "index.html";
    }
});

async function loadUserProfile(user) {
    onSnapshot(doc(db, "users", user.uid), (snap) => {
        if (snap.exists()) {
            const userData = snap.data();
            const upperName = (userData.username || "Koleksiyoner").toUpperCase();
            if (elements.navName) elements.navName.innerText = upperName;
            if (elements.popName) elements.popName.innerText = upperName;
            if (elements.hc) elements.hc.innerText = formatHC(userData.hc || 0);
            if (elements.navAvatar) elements.navAvatar.src = userData.photoURL || "https://api.dicebear.com/7.x/notionists/svg?seed=Hasan";
        }
    });
}

// Kapama ve Diğer Etkileşimler
const closeBtn = document.querySelector('.close-inspect');
if (closeBtn) closeBtn.onclick = () => elements.inspectModal.style.display = 'none';

window.onclick = (e) => {
    if (e.target == elements.inspectModal) elements.inspectModal.style.display = 'none';
};

window.handlePurchase = (amount) => alert(`${amount} HC satın alma ekranına yönlendiriliyorsunuz...`);

if (elements.logout) elements.logout.onclick = () => signOut(auth).then(() => window.location.href = "index.html");

if (elements.profileTrigger) {
    elements.profileTrigger.onclick = (e) => {
        e.stopPropagation();
        elements.profilePopover.style.display = elements.profilePopover.style.display === 'block' ? 'none' : 'block';
    };
}
document.addEventListener('click', () => { if (elements.profilePopover) elements.profilePopover.style.display = 'none'; });