import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, deleteDoc, doc, getDoc, updateDoc, setDoc, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

let loginAttempts = 0;

// --- GÜVENLİK DUVARI ---
onAuthStateChanged(auth, (user) => {
    if (!user || user.email !== "admin@gmail.com") {
        window.location.href = "mainpage.html";
    }
});

// --- PIN DOĞRULAMA ---
window.verifyPin = () => {
    const pinInput = document.getElementById('adminPin');
    if (pinInput.value === "1212") {
        document.getElementById('auth-wall').style.display = 'none';
        document.getElementById('admin-panel').style.display = 'flex';
    } else {
        loginAttempts++;
        if (loginAttempts >= 2) window.location.href = "mainpage.html";
        else document.getElementById('pin-error').innerText = "Hatalı Kod!";
    }
};

// --- NADİRLİK RENK PALETİ ---
const getRarityColor = (rarity) => {
    if (rarity.includes("AA+")) return "#FFD700";
    if (rarity.includes("AA"))  return "#FF4500";
    if (rarity.includes("BB"))  return "#1E90FF";
    if (rarity.includes("CC"))  return "#C0C0C0";
    if (rarity.includes("FF"))  return "#32CD32";
    return "#555";
};

// --- SEKSİYON YÖNETİMİ ---
window.showSection = function(sectionId) {
    ['add-card-section', 'card-pool-section', 'coin-packages-section'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    document.querySelectorAll('.nav-links a').forEach(l => l.classList.remove('active'));

    if (sectionId === 'add-card') {
        document.getElementById('add-card-section').style.display = 'block';
        document.querySelectorAll('.nav-links a')[0]?.classList.add('active');
    } else if (sectionId === 'card-pool') {
        document.getElementById('card-pool-section').style.display = 'block';
        document.querySelectorAll('.nav-links a')[1]?.classList.add('active');
        window.loadCardPool();
    } else if (sectionId === 'coin-packages') {
        document.getElementById('coin-packages-section').style.display = 'block';
        document.querySelectorAll('.nav-links a')[2]?.classList.add('active');
        window.loadCoinPackages();
    }
};

// --- KART HAVUZUNU YÜKLE ---
window.loadCardPool = async function() {
    const grid = document.getElementById('poolDisplay');

    if (!document.getElementById('adminSearchContainer')) {
        grid.insertAdjacentHTML('beforebegin', `
            <div id="adminSearchContainer" style="margin-bottom:30px; padding-bottom:20px; border-bottom:1px solid #222; display:flex; align-items:center; gap:20px;">
                <div style="position:relative; flex-grow:1; max-width:400px;">
                    <span style="position:absolute; left:15px; top:50%; transform:translateY(-50%); color:#555;">🔍</span>
                    <input type="text" id="adminCardSearch" placeholder="Oyuncu, Nadirlik veya ID ara..."
                           style="width:100%; background:#0a0a0a; border:1px solid var(--gold); color:#fff; padding:12px 12px 12px 40px; border-radius:10px; font-size:14px; outline:none;"
                           onkeyup="filterAdminCards()">
                </div>
                <div style="color:#444; font-size:12px; font-weight:800; text-transform:uppercase;">Toplam Varlık: <span id="totalCardCount" style="color:var(--gold);">0</span></div>
            </div>
        `);
    }

    grid.innerHTML = "<p style='color:var(--gold);'>Galeri mühürleri çözülüyor...</p>";

    try {
        const snap = await getDocs(query(collection(db, "allCards"), orderBy("createdAt", "desc")));
        grid.innerHTML = "";
        grid.style = "display:grid; grid-template-columns:repeat(auto-fill, minmax(180px, 1fr)); gap:25px;";
        document.getElementById('totalCardCount').innerText = snap.size;

        snap.forEach((docSnap) => {
            const card = docSnap.data();
            const cardId = docSnap.id;
            const rColor = getRarityColor(card.rarity);
            grid.innerHTML += `
                <div class="admin-mini-card"
                     data-search="${(card.name||'').toLowerCase()} ${(card.rarity||'').toLowerCase()} ${card.generalId||''}"
                     onclick="openCardPanel('${cardId}')"
                     style="cursor:pointer; background:#0f0f0f; border:1px solid #222; border-radius:12px; padding:12px; transition:0.3s; position:relative; border-bottom:2px solid ${rColor};">
                    <div style="width:100%; aspect-ratio:3/4; background:#000; border-radius:8px; overflow:hidden; margin-bottom:10px;">
                        <img src="${card.imageUrl}" style="width:100%; height:100%; object-fit:cover;">
                    </div>
                    <div style="text-align:center;">
                        <div style="color:${rColor}; font-size:10px; font-weight:900; text-transform:uppercase; letter-spacing:1px;">${card.rarity}</div>
                        <div style="color:#fff; font-size:14px; font-weight:700; margin:2px 0;">${card.name}</div>
                        <div style="color:#444; font-size:11px; font-weight:600;">ID: ${card.generalId}</div>
                    </div>
                    ${card.isLimited ? `<div style="position:absolute; top:8px; right:8px; background:var(--gold); color:#000; font-size:9px; font-weight:900; padding:2px 6px; border-radius:4px;">${card.limitedNo}/${card.maxSupply}</div>` : ''}
                </div>
            `;
        });
    } catch (e) { console.error(e); }
};

// --- ARAMA FİLTRESİ ---
window.filterAdminCards = function() {
    const term = document.getElementById('adminCardSearch').value.toLowerCase();
    document.querySelectorAll('.admin-mini-card').forEach(card => {
        card.style.display = card.getAttribute('data-search').includes(term) ? "block" : "none";
    });
};

// --- KART DETAY PANELİ ---
window.openCardPanel = async function(cardId) {
    const docSnap = await getDoc(doc(db, "allCards", cardId));
    if (!docSnap.exists()) return;
    const card = docSnap.data();
    const rColor = getRarityColor(card.rarity);

    const modal = document.createElement('div');
    modal.id = "adminModal";
    modal.style = "position:fixed; inset:0; background:rgba(0,0,0,0.95); z-index:99999; display:flex; align-items:center; justify-content:center; padding:20px; backdrop-filter:blur(10px);";
    modal.innerHTML = `
        <div class="form-card" style="max-width:950px; width:100%; display:grid; grid-template-columns:350px 1fr; gap:40px; position:relative; border:1px solid #333; border-top:4px solid ${rColor}; padding:40px;">
            <button onclick="document.getElementById('adminModal').remove()" style="position:absolute; top:20px; right:20px; background:none; border:none; color:#555; font-size:30px; cursor:pointer;">&times;</button>
            <div style="background:#000; border-radius:15px; border:1px solid #1a1a1a; overflow:hidden; display:flex; align-items:center; justify-content:center; aspect-ratio:3/4;">
                <img src="${card.imageUrl}" style="width:100%; height:100%; object-fit:cover;">
            </div>
            <div style="display:flex; flex-direction:column; justify-content:center;">
                <h1 style="color:#fff; font-size:36px; font-weight:800; margin-bottom:0;">${card.name}</h1>
                <p style="color:${rColor}; font-weight:800; letter-spacing:2px; margin-bottom:25px; text-transform:uppercase;">${card.rarity} | #${card.generalId}</p>
                <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; margin-bottom:30px;">
                    <div class="input-group"><span>GEN</span><div style="color:#fff; font-weight:800; font-size:16px;">${card.gen}</div></div>
                    <div class="input-group"><span>MEVKİ</span><div style="color:#fff; font-weight:800; font-size:16px;">${card.pos}</div></div>
                    <div class="input-group"><span>HP GÜÇ</span><div style="color:#fff; font-weight:800; font-size:16px;">${card.hp}</div></div>
                    <div class="input-group"><span>HC FİYAT</span><div style="color:var(--gold); font-weight:800; font-size:16px;">${card.hc}</div></div>
                    <div class="input-group"><span>PİYASA</span><div style="color:#fff; font-weight:800; font-size:16px;">${card.value}</div></div>
                    <div class="input-group"><span>ÜLKE</span><div style="color:#fff; font-weight:800; font-size:16px;">${card.nation}</div></div>
                    <div class="input-group" style="grid-column:span 3;"><span>SERİ BİLGİSİ</span><div style="color:#fff; font-size:14px; font-weight:700;">${card.series}</div></div>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                    <button class="btn-test" onclick="adminAction('market', '${cardId}')">📦 PAZARA SUN</button>
                    <button class="btn-test" onclick="adminAction('send', '${cardId}')">👤 KİŞİYE GÖNDER</button>
                    <button class="btn-submit" style="grid-column:span 2; opacity:1; margin-top:10px;" onclick="adminAction('edit', '${cardId}')">✍️ KARTI DÜZENLE</button>
                    <button style="grid-column:span 2; background:none; border:none; color:#ff4444; cursor:pointer; font-weight:800; margin-top:15px; font-size:11px; text-transform:uppercase;" onclick="deleteCard('${cardId}')">🗑️ KARTI VERİTABANINDAN SİL</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
};

// --- KART AKSİYONLARI ---
window.adminAction = async function(type, cardId) {
    if (type === 'send') {
        const targetEmail = prompt("Kartın gönderileceği kullanıcının e-posta adresini girin:");
        if (!targetEmail) return;
        try {
            const cardSnap = await getDoc(doc(db, "allCards", cardId));
            if (!cardSnap.exists()) return alert("Kart bulunamadı!");
            const cardData = cardSnap.data();

            // Hedef kullanıcının uid'sini bul
            const usersSnap = await getDocs(query(collection(db, "users"), where("email", "==", targetEmail.trim().toLowerCase())));
            let targetUid = null;
            usersSnap.forEach(d => { targetUid = d.id; });

            let imageUrl = cardData.imageUrl || "";
            if (imageUrl.includes("github.com")) {
                imageUrl = imageUrl
                    .replace("https://github.com/", "https://raw.githubusercontent.com/")
                    .replace("/blob/", "/")
                    .replace("?raw=true", "");
            }

            const userCardData = {
                ...cardData,
                imageUrl,
                ownerEmail: targetEmail.trim().toLowerCase(),
                userId: targetUid || "",
                cardId: cardId,
                isLocked: false,
                source: "Admin Hediyesi",
                obtainedAt: new Date(),
            };

            if (targetUid) {
                await setDoc(doc(db, "userCards", `${targetUid}_${cardId}`), userCardData);
            } else {
                await addDoc(collection(db, "userCards"), userCardData);
            }

            alert(`${cardData.name} başarıyla ${targetEmail} adresine mühürlendi!`);
            document.getElementById('adminModal')?.remove();
        } catch (error) {
            console.error(error);
            alert("Gönderim başarısız: " + error.message);
        }
    } else {
        alert(type.toUpperCase() + " özelliği çok yakında!");
    }
};

// --- BOZUK KART KAYITLARINI TEMİZLE ---
window.cleanBrokenCards = async function() {
    const btn = document.getElementById('cleanBrokenBtn');
    if (btn) { btn.innerText = "TEMİZLENİYOR..."; btn.disabled = true; }
    try {
        const snap = await getDocs(collection(db, "userCards"));
        let deleted = 0;
        for (const d of snap.docs) {
            const data = d.data();
            if (!data.name || data.name === 'undefined' || data.name === '' || !data.generalId) {
                await deleteDoc(doc(db, "userCards", d.id));
                deleted++;
            }
        }
        alert(`Temizlendi! ${deleted} bozuk kayıt silindi.`);
    } catch(e) {
        alert("Hata: " + e.message);
    } finally {
        if (btn) { btn.innerText = "🧹 BOZUK KARTLARI TEMİZLE"; btn.disabled = false; }
    }
};

// --- DİĞER FONKSİYONLAR ---
window.toggleLimitedFields = function() {
    const isLimited = document.getElementById('c_is_limited').value === "true";
    document.getElementById('limited_fields').style.display = isLimited ? 'flex' : 'none';
};

window.previewCard = function() {
    const name = document.getElementById('c_name').value;
    const img  = document.getElementById('c_img').value;
    const rarity = document.getElementById('c_rarity').value;
    const isLimited = document.getElementById('c_is_limited').value === "true";
    const lNo  = document.getElementById('c_limited_no')?.value || "0";
    const mSup = document.getElementById('c_supply').value || "0";
    if (!name || !img) return alert("İsim ve Resim şart!");
    const rColor = getRarityColor(rarity);
    document.getElementById('cardPreview').innerHTML = `
        <div style="position:relative; border:3px solid ${rColor}; padding:15px; border-radius:15px; background:#000; text-align:center; color:white; width:220px; margin:auto;">
            ${isLimited ? `<div style="position:absolute; top:10px; right:10px; background:var(--gold); color:black; padding:2px 8px; border-radius:4px; font-weight:900; font-size:12px;">${lNo}/${mSup}</div>` : ''}
            <div style="height:250px; background:url('${img}') center/cover no-repeat; border-radius:8px; margin-bottom:10px; border:1px solid #222;"></div>
            <div style="font-size:11px; font-weight:900; color:${rColor}; text-transform:uppercase;">${rarity}</div>
            <div style="font-size:18px; font-weight:800; text-transform:uppercase;">${name}</div>
        </div>
    `;
    document.getElementById('submitBtn').disabled = false;
};

window.pushToDB = async function() {
    const btn = document.getElementById('submitBtn');
    btn.innerText = "MÜHÜRLENİYOR..."; btn.disabled = true;
    const isLimited = document.getElementById('c_is_limited').value === "true";
    const cardData = {
        generalId: document.getElementById('c_id').value,
        name:      document.getElementById('c_name').value,
        gen:       Number(document.getElementById('c_gen').value),
        pos:       document.getElementById('c_pos').value,
        value:     document.getElementById('c_value').value,
        hp:        Number(document.getElementById('c_hp').value),
        hc:        Number(document.getElementById('c_hc').value),
        maxSupply: Number(document.getElementById('c_supply').value),
        isLimited: isLimited,
        limitedNo: isLimited ? Number(document.getElementById('c_limited_no').value) : null,
        series:    document.getElementById('c_series').value,
        nation:    document.getElementById('c_nation').value,
        imageUrl:  document.getElementById('c_img').value,
        rarity:    document.getElementById('c_rarity').value,
        createdAt: new Date()
    };
    try {
        await addDoc(collection(db, "allCards"), cardData);
        alert("Kart Başarıyla Mühürlendi!");
        location.reload();
    } catch (e) { alert("Hata!"); btn.disabled = false; }
};

window.deleteCard = async function(id) {
    if (confirm("DİKKAT: Bu mühürlü varlık yok edilecek!")) {
        try {
            await deleteDoc(doc(db, "allCards", id));
            document.getElementById('adminModal')?.remove();
            window.loadCardPool();
        } catch (e) { alert("Hata!"); }
    }
};

// --- TÜM LİNKLERİ DÜZELT ---
window.fixAllLinks = async function() {
    const btn = document.getElementById('fixLinksBtn');
    if (btn) { btn.innerText = "DÜZELTILIYOR..."; btn.disabled = true; }
    function toRaw(url) {
        if (!url || !url.includes("github.com")) return url;
        return url
            .replace("https://github.com/", "https://raw.githubusercontent.com/")
            .replace("/blob/", "/")
            .replace("?raw=true", "");
    }
    try {
        let fixed = 0;
        for (const d of (await getDocs(collection(db, "allCards"))).docs) {
            const url = d.data().imageUrl || "";
            const fixed_url = toRaw(url);
            if (fixed_url !== url) { await updateDoc(doc(db, "allCards", d.id), { imageUrl: fixed_url }); fixed++; }
        }
        for (const d of (await getDocs(collection(db, "userCards"))).docs) {
            const url = d.data().imageUrl || "";
            const fixed_url = toRaw(url);
            if (fixed_url !== url) { await updateDoc(doc(db, "userCards", d.id), { imageUrl: fixed_url }); fixed++; }
        }
        alert("TAMAM! " + fixed + " link düzeltildi.");
    } catch(e) {
        alert("Hata: " + e.message);
    } finally {
        if (btn) { btn.innerText = "🔗 LİNKLERİ DÜZELT"; btn.disabled = false; }
    }
};

// --- COİN PAKETİ YÖNETİMİ ---
window.loadCoinPackages = async function() {
    const list = document.getElementById('coinPackagesList');
    if (!list) return;
    list.innerHTML = '<p style="color:#444;">Yükleniyor...</p>';
    try {
        const snap = await getDocs(collection(db, "coinPackages"));
        if (snap.empty) {
            list.innerHTML = '<p style="color:#444;">Henüz paket yok. Soldaki formdan ekle.</p>';
            return;
        }
        const pkgs = [];
        snap.forEach(d => pkgs.push({ id: d.id, ...d.data() }));
        pkgs.sort((a, b) => (a.order || 0) - (b.order || 0));
        list.innerHTML = pkgs.map(pkg => `
            <div style="display:flex; align-items:center; justify-content:space-between; background:#0a0a0a; border:1px solid #222; padding:15px 20px; border-radius:10px;">
                <div style="display:flex; align-items:center; gap:15px;">
                    <span style="color:#4caf50; font-size:24px; font-weight:900;">${pkg.amount}</span>
                    <div>
                        <div style="color:#fff; font-weight:700; font-size:13px;">HAS COIN</div>
                        <div style="color:#666; font-size:12px;">${pkg.price} · Sıra: ${pkg.order || '-'}</div>
                    </div>
                </div>
                <div style="display:flex; gap:10px;">
                    <button onclick="window.editCoinPackage('${pkg.id}', ${pkg.amount}, '${pkg.price}', ${pkg.order||0})"
                            style="background:#1a1a1a; border:1px solid #333; color:#ffc107; padding:8px 14px; border-radius:6px; cursor:pointer; font-size:12px; font-weight:700;">DÜZENLE</button>
                    <button onclick="window.deleteCoinPackage('${pkg.id}')"
                            style="background:#1a1a1a; border:1px solid #333; color:#ff4444; padding:8px 14px; border-radius:6px; cursor:pointer; font-size:12px; font-weight:700;">SİL</button>
                </div>
            </div>
        `).join('');
    } catch(e) { list.innerHTML = '<p style="color:#f44;">Yükleme hatası!</p>'; console.error(e); }
};

window.addCoinPackage = async function() {
    const amount = Number(document.getElementById('cp_amount').value);
    const price  = document.getElementById('cp_price').value.trim();
    const order  = Number(document.getElementById('cp_order').value) || 99;
    if (!amount || !price) { alert("Miktar ve fiyat zorunlu!"); return; }
    try {
        await addDoc(collection(db, "coinPackages"), { amount, price, order, createdAt: new Date() });
        document.getElementById('cp_amount').value = '';
        document.getElementById('cp_price').value  = '';
        document.getElementById('cp_order').value  = '';
        alert("Paket eklendi!");
        window.loadCoinPackages();
    } catch(e) { alert("Hata: " + e.message); }
};

window.deleteCoinPackage = async function(id) {
    if (!confirm("Bu paketi silmek istediğine emin misin?")) return;
    try {
        await deleteDoc(doc(db, "coinPackages", id));
        window.loadCoinPackages();
    } catch(e) { alert("Silme hatası: " + e.message); }
};

window.editCoinPackage = function(id, amount, price, order) {
    const newAmount = prompt("Yeni HC miktarı:", amount);
    if (newAmount === null) return;
    const newPrice = prompt("Yeni fiyat (örn: 99.99 TL):", price);
    if (newPrice === null) return;
    const newOrder = prompt("Sıra numarası:", order);
    if (newOrder === null) return;
    updateDoc(doc(db, "coinPackages", id), {
        amount: Number(newAmount),
        price:  newPrice.trim(),
        order:  Number(newOrder)
    }).then(() => { alert("Güncellendi!"); window.loadCoinPackages(); })
      .catch(e => alert("Hata: " + e.message));
};

window.seedDefaultPackages = async function() {
    if (!confirm("Varsayılan 6 coin paketi Firebase'e eklensin mi?")) return;
    const defaults = [
        { amount: 60,   price: '19.99 TL',  order: 1 },
        { amount: 150,  price: '44.99 TL',  order: 2 },
        { amount: 380,  price: '99.99 TL',  order: 3 },
        { amount: 720,  price: '189.99 TL', order: 4 },
        { amount: 1850, price: '449.99 TL', order: 5 },
        { amount: 3000, price: '699.99 TL', order: 6 },
    ];
    try {
        for (const pkg of defaults) {
            await addDoc(collection(db, "coinPackages"), { ...pkg, createdAt: new Date() });
        }
        alert("6 varsayılan paket eklendi!");
        window.loadCoinPackages();
    } catch(e) { alert("Hata: " + e.message); }
};

// --- EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('loginBtn')?.addEventListener('click', window.verifyPin);
    document.getElementById('adminPin')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') window.verifyPin(); });
});
