import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, onSnapshot, collection, getDocs, getDoc, runTransaction, serverTimestamp, addDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
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
    inspectModal: document.getElementById('inspect-modal'),
    revealOverlay: document.getElementById('pack-opening-overlay'),
    shakingPack: document.getElementById('shaking-pack'),
    cardsContainer: document.getElementById('revealed-cards-container'),
    closeRevealBtn: document.getElementById('close-reveal-btn')
};

// Coin paketleri Firebase'den yükleniyor

// --- YARDIMCI FONKSİYONLAR ---
function formatHC(number) {
    return Number(number).toLocaleString('tr-TR');
}

function pickRarityGroup() {
    const chance = Math.random() * 100;
    if (chance <= 3) return "AA+";
    if (chance <= 10) return "AA"; 
    return "BB";
}

function getRarityStyle(label) {
    const styles = {
        "AA+": { color: "#ffc107" },
        "AA": { color: "#00e5ff" },
        "BB": { color: "#4caf50" },
        "CC": { color: "#ff5722" },
        "FF": { color: "#9e9e9e" }
    };
    return styles[label] || { color: "#ffffff" };
}

// --- MARKET RENDER MOTORU ---
async function renderCoinPackages() {
    if (!elements.coinContainer) return;
    elements.coinContainer.innerHTML = '<p style="color:#444;text-align:center;padding:40px;">Yükleniyor...</p>';
    try {
        const snap = await getDocs(collection(db, "coinPackages"));
        if (snap.empty) {
            elements.coinContainer.innerHTML = '<p style="color:#444;text-align:center;padding:40px;">Coin paketi bulunamadı.</p>';
            return;
        }
        // order alanına göre sırala
        const pkgs = [];
        snap.forEach(d => pkgs.push({ id: d.id, ...d.data() }));
        pkgs.sort((a, b) => (a.order || 0) - (b.order || 0));

        elements.coinContainer.innerHTML = pkgs.map(pkg => `
            <div class="coin-card">
                <div class="coin-icon-wrapper">
                    <span class="material-symbols-outlined icon-green">payments</span>
                </div>
                <span class="hc-amount">${pkg.amount}</span>
                <span class="hc-label">HAS COIN</span>
                <button class="buy-btn" onclick="window.handlePurchase('${pkg.id}', ${pkg.amount}, '${pkg.price}')">${pkg.price}</button>
            </div>
        `).join('');
    } catch(e) {
        console.error("Coin paketleri yüklenemedi:", e);
    }
}

async function renderMarketPacks() {
    if (!elements.packContainer) return;
    try {
        const packsSnap = await getDocs(collection(db, "packs"));
        elements.packContainer.innerHTML = ""; 
        
        packsSnap.forEach((docSnap) => {
            const pack = docSnap.data();
            const packId = docSnap.id;
            const packCard = `
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
            elements.packContainer.insertAdjacentHTML('beforeend', packCard);
        });
    } catch (error) {
        console.error("Paket yükleme hatası:", error);
    }
}

// --- SATIN ALMA VE ŞANS MOTORU (Global Collection Check Fixed) ---
window.purchasePack = async (packId, price) => {
    if (!currentUser) {
        alert("Önce giriş yapmalısın!");
        return;
    }

    const confirmPurchase = confirm(`Bu paketi ${price} HC karşılığında açmak istiyor musun?`);
    if (!confirmPurchase) return;

    try {
        let chosenCardsWithStatus = [];
        let packImg = "";

        await runTransaction(db, async (transaction) => {
            const userRef = doc(db, "users", currentUser.uid);
            const packRef = doc(db, "packs", packId);

            const userSnap = await transaction.get(userRef);
            const packSnap = await transaction.get(packRef);

            if (!userSnap.exists() || !packSnap.exists()) throw "Veri hatası!";
            
            const userData = userSnap.data();
            const packData = packSnap.data();
            const currentHC = userData.hc || 0;

            if (currentHC < price) throw "Yetersiz bakiye!";
            
            packImg = packData.packImg;
            const packContentIds = packData.content;

            const cardDocs = await Promise.all(packContentIds.map(id => getDoc(doc(db, "allCards", id.trim()))));

            let selectedSnaps = [];
            for(let i = 0; i < 3; i++) {
                const targetRarity = pickRarityGroup();
                let group = cardDocs.filter(c => c.exists() && c.data().rarity.includes(targetRarity));
                let finalSnap = group.length > 0 
                    ? group[Math.floor(Math.random() * group.length)]
                    : cardDocs[Math.floor(Math.random() * cardDocs.length)];
                selectedSnaps.push(finalSnap);
            }

            // --- BURASI KRİTİK: TÜM KOLEKSİYONDA VAR MI KONTROLÜ ---
            const checkPromises = selectedSnaps.map(snap => transaction.get(doc(db, "userCards", `${currentUser.uid}_${snap.id}`)));
            const existSnaps = await Promise.all(checkPromises);

            selectedSnaps.forEach((snap, index) => {
                const isNew = !existSnaps[index].exists();
                if (isNew) {
                    const cd = snap.data();
                    let imageUrl = cd.imageUrl || "";
                    if (imageUrl.includes("github.com")) {
                        imageUrl = imageUrl
                            .replace("https://github.com/", "https://raw.githubusercontent.com/")
                            .replace("/blob/", "/")
                            .replace("?raw=true", "");
                    }
                    transaction.set(doc(db, "userCards", `${currentUser.uid}_${snap.id}`), {
                        userId:     currentUser.uid,
                        ownerEmail: currentUser.email.toLowerCase(),
                        cardId:     snap.id,
                        obtainedAt: serverTimestamp(),
                        source:     packData.name,
                        isLocked:   false,
                        imageUrl:   imageUrl,
                        name:       cd.name      || "",
                        rarity:     cd.rarity    || "",
                        generalId:  cd.generalId || "",
                        gen:        cd.gen        || 0,
                        pos:        cd.pos        || "",
                        hp:         cd.hp         || 0,
                        hc:         cd.hc         || 0,
                        value:      cd.value      || "",
                        nation:     cd.nation     || "TR",
                        series:     cd.series     || "",
                        maxSupply:  cd.maxSupply  || 0,
                        limitedNo:  cd.limitedNo  || 0,
                    });
                }
                chosenCardsWithStatus.push({ snap: snap, isNew: isNew });
            });

            transaction.update(userRef, { hc: currentHC - price });
        });

        startPackReveal(chosenCardsWithStatus, packImg);

    } catch (error) {
        alert("İşlem başarısız: " + error);
        console.error("Transaction Error:", error);
    }
};

// --- PAKET AÇILIŞ ANİMASYONU (Görsel ve Etiket Fixlendi) ---
async function startPackReveal(cardsWithStatus, packImg) {
    elements.revealOverlay.style.display = 'flex';
    elements.shakingPack.style.display = 'block';
    elements.shakingPack.querySelector('img').src = packImg;
    elements.cardsContainer.innerHTML = '';
    elements.closeRevealBtn.style.display = 'none';

    setTimeout(() => {
        elements.shakingPack.style.display = 'none';

        cardsWithStatus.forEach((obj) => {
            const cardSnap = obj.snap;
            const isNew = obj.isNew;

            if (cardSnap.exists()) {
                const data = cardSnap.data();
                const rarityStyle = getRarityStyle(data.rarity.split(' ')[0]);
                const cardWrapper = document.createElement('div');
                cardWrapper.className = 'card-reveal-wrapper';
                
                // NEW Yazısı: Daha küçük ve sağ üstte
                const newBadge = isNew ? `
                    <div class="new-tag" style="position: absolute; top: -5px; right: -5px; background: #ff0000; color: white; padding: 3px 8px; border-radius: 4px; font-weight: 900; font-size: 10px; z-index: 100; box-shadow: 0 0 10px rgba(255,0,0,0.5); border: 1.5px solid white; transform: rotate(5deg);">NEW</div>
                ` : '';

                // GitHub linkini raw'a çevir
                let imgUrl = data.imageUrl || "";
                if (imgUrl.includes("github.com")) {
                    imgUrl = imgUrl
                        .replace("https://github.com/", "https://raw.githubusercontent.com/")
                        .replace("/blob/", "/")
                        .replace("?raw=true", "");
                }

                // Limited tag
                const limitedTag = ''; // Kart üzerinde gösterilmiyor, kart tasarımında zaten var

                cardWrapper.innerHTML = `
                    <div class="card-inner">

                        <div class="card-front" style="position:absolute;width:100%;height:100%;
                             backface-visibility:hidden;-webkit-backface-visibility:hidden;
                             border-radius:12px;overflow:hidden;background:#1a0a3d;">
                            <img src="img/Kart_Arkası_Mavi.png"
                                 style="width:100%;height:100%;object-fit:cover;display:block;pointer-events:none;"
                                 draggable="false"
                                 oncontextmenu="return false"
                                 onerror="this.style.display='none';">
                            <div style="position:absolute;bottom:12px;left:50%;transform:translateX(-50%);
                                        background:${rarityStyle.color};color:#000;font-size:10px;
                                        font-weight:900;padding:3px 10px;border-radius:5px;
                                        white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.6);">
                                ${data.rarity}
                            </div>
                        </div>

                        <div class="card-back" style="position:absolute;width:100%;height:100%;
                             backface-visibility:hidden;-webkit-backface-visibility:hidden;
                             transform:rotateY(180deg);border:2px solid ${rarityStyle.color};
                             border-radius:12px;overflow:hidden;background:#000;">
                            ${newBadge}
                            ${limitedTag}
                            <img src="${imgUrl}" alt="${data.name}"
                                 style="width:100%;height:100%;object-fit:cover;display:block;background:#000;pointer-events:none;user-select:none;"
                                 draggable="false"
                                 oncontextmenu="return false"
                                 onerror="this.src='https://placehold.co/200x280/111/333?text=?';">
                        </div>

                    </div>
                `;

                cardWrapper.querySelector('.card-inner').onclick = function() {
                    this.classList.add('is-flipped');
                };

                elements.cardsContainer.appendChild(cardWrapper);
            }
        });

        setTimeout(() => {
            elements.closeRevealBtn.style.display = 'block';
            elements.closeRevealBtn.innerText = "KOLEKSİYONA EKLE";
        }, 600);
    }, 2000);
}

// --- İNCELEME MODALI ---
window.openPackInspect = async (packId) => {
    const modal = elements.inspectModal;
    if (!modal) return;
    try {
        const packSnap = await getDoc(doc(db, "packs", packId));
        if (packSnap.exists()) {
            const pack = packSnap.data();
            const cardGrid = modal.querySelector('.possible-cards-grid');
            modal.querySelector('.inspect-header h2').innerText = pack.name;
            modal.querySelector('.floating-pack').src = pack.packImg;
            cardGrid.innerHTML = `<p style="color:white">Yükleniyor...</p>`;
            modal.style.display = 'flex';

            const cardPromises = pack.content.map(id => getDoc(doc(db, "allCards", id.trim())));
            const cardsData = await Promise.all(cardPromises);
            
            cardGrid.innerHTML = cardsData.map(c => {
                if (!c.exists()) return '';
                const data = c.data();
                return `
                    <div class="mini-card-slot">
                        <img src="${data.imageUrl}" alt="Kart" style="width:100%; height:100%; object-fit:contain;">
                    </div>
                `;
            }).join('');
        }
    } catch (error) { console.error("İnceleme hatası:", error); }
};

// --- OTURUM VE PROFİL ---
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
            if (elements.navAvatar) elements.navAvatar.src = userData.photoURL || `https://api.dicebear.com/7.x/notionists/svg?seed=${user.uid}`;
        }
    });
}

// --- EVENT LISTENERS ---
if (elements.closeRevealBtn) {
    elements.closeRevealBtn.onclick = () => { elements.revealOverlay.style.display = 'none'; };
}

const closeInspectBtn = document.querySelector('.close-inspect');
if (closeInspectBtn) closeInspectBtn.onclick = () => elements.inspectModal.style.display = 'none';

window.handlePurchase = async (pkgId, amount, price) => {
    if (!currentUser) { alert("Önce giriş yapmalısın!"); return; }
    const confirm1 = confirm(`${amount} HAS COIN satın almak istiyor musun?\n\nFiyat: ${price}\n\n(Bu simülasyon modunda — gerçek ödeme sistemi yakında!)`)
    if (!confirm1) return;
    try {
        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) { alert("Kullanıcı bulunamadı!"); return; }
        const currentHC = userSnap.data().hc || 0;
        const { updateDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
        await updateDoc(userRef, { hc: currentHC + amount });
        alert(`✅ ${amount} HAS COIN hesabına eklendi!\nYeni bakiye: ${(currentHC + amount).toLocaleString('tr-TR')} HC`);
    } catch(e) {
        alert("İşlem başarısız: " + e.message);
        console.error(e);
    }
};

if (elements.logout) elements.logout.onclick = () => signOut(auth).then(() => window.location.href = "index.html");

if (elements.profileTrigger) {
    elements.profileTrigger.onclick = (e) => {
        e.stopPropagation();
        const isVisible = elements.profilePopover.style.display === 'block';
        elements.profilePopover.style.display = isVisible ? 'none' : 'block';
    };
}
document.addEventListener('click', () => { if (elements.profilePopover) elements.profilePopover.style.display = 'none'; });
