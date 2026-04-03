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

function formatHC(number) {
    return Number(number).toLocaleString('tr-TR');
}

// --- OTURUM ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        loadUserProfile(user);
        loadUserCards(user);
    } else {
        window.location.href = "index.html";
    }
});

// --- PROFİL ---
async function loadUserProfile(user) {
    onSnapshot(doc(db, "users", user.uid), (snap) => {
        if (snap.exists()) {
            const userData = snap.data();
            const rawName = userData.username || userData.displayName || "Koleksiyoner";
            if (elements.navName) elements.navName.innerText = rawName.toUpperCase();
            if (elements.popName) elements.popName.innerText = rawName.toUpperCase();
            if (elements.hc) elements.hc.innerText = formatHC(userData.hc || 0);
            const defaultAvatar = "https://api.dicebear.com/7.x/notionists/svg?seed=Hasan&backgroundColor=1a1a1a";
            const avatarImg = document.getElementById('nav-avatar');
            if (avatarImg) {
                avatarImg.src = userData.photoURL || defaultAvatar;
                avatarImg.onerror = () => { avatarImg.src = defaultAvatar; };
            }
        }
    });
}

// --- KOLEKSİYON ---
// Global map — filtreler erişebilsin
const allCardsMap = new Map();

function renderAll() {
    if (!elements.grid) return;
    elements.grid.innerHTML = "";
    let totalHp = 0;

    if (allCardsMap.size === 0) {
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

    // Filtre değerlerini oku
    const search = (document.getElementById('search-input')?.value || "").toLowerCase().trim();
    const rarity = document.getElementById('filter-rarity')?.value || "";
    const lock   = document.getElementById('filter-lock')?.value || "";
    const sort   = document.getElementById('filter-sort')?.value || "";

    let cards = Array.from(allCardsMap.values());

    // Filtrele
    if (search) cards = cards.filter(c => (c.name || "").toLowerCase().includes(search));
    if (rarity) cards = cards.filter(c => (c.rarity || "").includes(rarity));
    if (lock === "locked")   cards = cards.filter(c => c.isLocked);
    if (lock === "unlocked") cards = cards.filter(c => !c.isLocked);

    // Sırala
    if (sort === "hp-desc") cards.sort((a, b) => (b.hp || 0) - (a.hp || 0));
    if (sort === "hp-asc")  cards.sort((a, b) => (a.hp || 0) - (b.hp || 0));
    if (sort === "hc-desc") cards.sort((a, b) => (b.hc || 0) - (a.hc || 0));
    if (sort === "hc-asc")  cards.sort((a, b) => (a.hc || 0) - (b.hc || 0));

    if (cards.length === 0) {
        elements.grid.innerHTML = `
            <div class="empty-state-card">
                <h2>SONUÇ YOK</h2>
                <p>Filtrelere uyan kart bulunamadı.</p>
            </div>`;
        return;
    }

    cards.forEach(data => {
        totalHp += parseInt(data.hp) || 0;
        renderCard(data);
    });
    updateStats(allCardsMap.size, totalHp);
}

// Sıfırla butonu — global erişim için window'a bağla
window.resetFilters = function() {
    const si = document.getElementById('search-input');
    const fr = document.getElementById('filter-rarity');
    const fl = document.getElementById('filter-lock');
    const fs = document.getElementById('filter-sort');
    if (si) si.value = "";
    if (fr) fr.value = "";
    if (fl) fl.value = "";
    if (fs) fs.value = "";
    renderAll();
};

function loadUserCards(user) {
    if (!user) return;

    const qEmail = query(collection(db, "userCards"), where("ownerEmail", "==", user.email.toLowerCase()));
    const qUid   = query(collection(db, "userCards"), where("userId", "==", user.uid));

    onSnapshot(qEmail, (snap) => {
        snap.docChanges().forEach(change => {
            if (change.type === "removed") allCardsMap.delete(change.doc.id);
            else allCardsMap.set(change.doc.id, { ...change.doc.data(), id: change.doc.id });
        });
        renderAll();
    });

    onSnapshot(qUid, (snap) => {
        snap.docChanges().forEach(change => {
            if (change.type === "removed") allCardsMap.delete(change.doc.id);
            else allCardsMap.set(change.doc.id, { ...change.doc.data(), id: change.doc.id });
        });
        renderAll();
    });

    // Filtre eventleri
    document.getElementById('search-input')?.addEventListener('input', renderAll);
    document.getElementById('filter-rarity')?.addEventListener('change', renderAll);
    document.getElementById('filter-lock')?.addEventListener('change', renderAll);
    document.getElementById('filter-sort')?.addEventListener('change', renderAll);
}

function renderCard(data) {
    // Eksik/bozuk kart verisi — gösterme
    if (!data.name || data.name === 'undefined' || !data.generalId) return;

    const cardImg = data.imageUrl || data.image || "";
    const rarityClass = data.rarity?.includes('LEGEND') ? 'legendary' : '';
    const lockIcon = data.isLocked ? '<div class="lock-tag" style="position:absolute; top:10px; right:10px; z-index:5;">🔒</div>' : '';

    const cardHTML = `
        <div class="card-item ${rarityClass}" id="card-${data.id}" style="cursor:pointer; position:relative;">
            ${lockIcon}
            <div class="card-glow"></div>
            <div class="card-content">
                <div class="card-image" style="background-image: url('${cardImg}'); background-size: contain; background-repeat: no-repeat; background-position: center; background-color: rgba(0,0,0,0.2);"></div>
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

// --- DETAY MODAL ---
function openCardDetail(data) {
    const modalImg = data.imageUrl || data.image || "";

    // Nadirliğe göre panel class'ı
    const panel = document.querySelector('.admin-style-panel');
    if (panel) {
        panel.classList.remove('rarity-legend','rarity-epic','rarity-origin','rarity-standart','rarity-talent');
        const r = (data.rarity || "").toUpperCase();
        if (r.includes('AA+'))    panel.classList.add('rarity-legend');
        else if (r.includes('AA')) panel.classList.add('rarity-epic');
        else if (r.includes('BB')) panel.classList.add('rarity-origin');
        else if (r.includes('FF')) panel.classList.add('rarity-talent');
        else                       panel.classList.add('rarity-standart');

        // Animasyon yeniden tetikle
        panel.style.animation = 'none';
        panel.offsetHeight; // reflow
        panel.style.animation = '';
    }

    elements.mName.innerText = data.name.toUpperCase();
    const rarityColors = {'AA+':'#ffc107','AA':'#ce93d8','BB':'#64b5f6','CC':'#81c784','FF':'#90a4ae'};
    const rKey = Object.keys(rarityColors).find(k => (data.rarity||'').includes(k)) || 'CC';
    elements.mRarity.innerText = `${data.rarity || 'AA+ LEGEND'} | #${data.generalId || '000'}`;
    elements.mRarity.style.color = rarityColors[rKey];
    elements.mGen.innerText = data.gen || "0";
    elements.mPos.innerText = data.pos || "N/A";
    elements.mHp.innerText = data.hp || "0";
    elements.mValue.innerText = data.value || "0M€";
    if (elements.mHcPrice) elements.mHcPrice.innerText = formatHC(data.hc || 0);
    if (elements.mCountry) elements.mCountry.innerText = data.nation || "TR";

    elements.mRender.innerHTML = `
        <div style="position:relative;">
            <img src="${modalImg}" style="width: 100%; border-radius: 15px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); object-fit: contain;">
        </div>
    `;

    const quickPrice = Math.floor((data.hc || 0) * 0.7);
    const quickSellBtn = document.getElementById('btn-hizli-sat');
    const lockBtn = document.getElementById('btn-kilitle');
    const pazarBtn = document.getElementById('btn-pazara-sun');
    const deleteBtn = document.getElementById('btn-delete-record');

    if (deleteBtn) deleteBtn.innerText = "🗑️ KOLEKSİYONDAN ÇIKAR";
    if (quickSellBtn) quickSellBtn.innerText = `💰 HIZLI SAT (${formatHC(quickPrice)} HC)`;

    if (data.isLocked) {
        if (lockBtn) lockBtn.innerText = "🔓 KİLİDİ AÇ";
        if (quickSellBtn) { quickSellBtn.disabled = true; quickSellBtn.style.opacity = "0.5"; }
        if (pazarBtn) pazarBtn.disabled = true;
    } else {
        if (lockBtn) lockBtn.innerText = "🔒 KİLİTLE";
        if (quickSellBtn) { quickSellBtn.disabled = false; quickSellBtn.style.opacity = "1"; }
        if (pazarBtn) pazarBtn.disabled = false;
    }

    quickSellBtn.onclick = () => handleQuickSell(data, quickPrice);
    lockBtn.onclick = () => handleToggleLock(data);
    if (deleteBtn) deleteBtn.onclick = () => handleDeleteCard(data);
    if (pazarBtn) pazarBtn.onclick = () => window.location.href = "market.html";

    elements.modal.style.display = 'flex';
}

// --- AKSİYONLAR ---
async function handleQuickSell(data, price) {
    if (confirm(`${data.name} kartını ${formatHC(price)} HC karşılığında sisteme satmak istediğine emin misin?`)) {
        try {
            await deleteDoc(doc(db, "userCards", data.id));
            await updateDoc(doc(db, "users", currentUser.uid), { hc: increment(price) });
            elements.modal.style.display = 'none';
        } catch (err) { console.error("Satış hatası:", err); }
    }
}

async function handleToggleLock(data) {
    try {
        await updateDoc(doc(db, "userCards", data.id), { isLocked: !data.isLocked });
        elements.modal.style.display = 'none';
    } catch (err) { console.error("Kilitleme hatası:", err); }
}

async function handleDeleteCard(data) {
    if (confirm("Bu kartı koleksiyonunuzdan tamamen çıkarmak istediğinize emin misiniz?")) {
        try {
            await deleteDoc(doc(db, "userCards", data.id));
            elements.modal.style.display = 'none';
        } catch (err) { console.error("Silme hatası:", err); }
    }
}

if (document.getElementById('close-detail-modal')) {
    document.getElementById('close-detail-modal').onclick = () => {
        elements.modal.style.display = 'none';
    };
}

window.onclick = (event) => {
    if (event.target == elements.modal) elements.modal.style.display = 'none';
};

function updateStats(count, hp) {
    if (elements.count) elements.count.innerText = count;
    if (elements.hp) elements.hp.innerText = hp;
}

if (elements.logout) {
    elements.logout.onclick = (e) => {
        e.preventDefault();
        signOut(auth).then(() => window.location.href = "index.html");
    };
}
