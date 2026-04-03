import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    getFirestore, collection, addDoc, getDocs, query, orderBy, deleteDoc,
    doc, getDoc, updateDoc, setDoc, where, onSnapshot, serverTimestamp,
    increment, arrayUnion, arrayRemove, limit
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCKDafA6zXmdqDU6Fd9gE434sW3CYT1dCE",
    authDomain: "origincard-f2676.firebaseapp.com",
    projectId: "origincard-f2676",
    storageBucket: "origincard-f2676.firebasestorage.app",
    messagingSenderId: "837946557108",
    appId: "1:837946557108:web:7b61c25ef8399473864de1",
    measurementId: "G-WHPE66ENDP"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

let currentUser    = null;
let currentUserDoc = null;
let activeListType = 'sabit';
let chatUnsub      = null;
let dmUnsub        = null;
let dmTargetId     = null;
let dmTargetName   = null;
let allListings    = [];
let dmUnreadCounts = {}; // { uid: count }
let totalUnread    = 0;

// ─────────────────────────────────────────────
//  YARDIMCI FONKSİYONLAR
// ─────────────────────────────────────────────
function rarityColor(r = '') {
    if (r.includes('AA+')) return '#FFD700';
    if (r.includes('AA'))  return '#FF4500';
    if (r.includes('BB'))  return '#1E90FF';
    if (r.includes('CC'))  return '#C0C0C0';
    if (r.includes('FF'))  return '#32CD32';
    return '#555';
}

function timeAgo(ts) {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const diff = Math.floor((Date.now() - d) / 1000);
    if (diff < 60)    return `${diff}s önce`;
    if (diff < 3600)  return `${Math.floor(diff/60)}dk önce`;
    if (diff < 86400) return `${Math.floor(diff/3600)}sa önce`;
    return `${Math.floor(diff/86400)}g önce`;
}

function timeLeft(expiresAt) {
    if (!expiresAt) return '?';
    const ms = (expiresAt.toDate ? expiresAt.toDate() : new Date(expiresAt)) - Date.now();
    if (ms <= 0) return 'Süresi doldu';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    if (h >= 24) return `${Math.floor(h/24)}g ${h%24}sa`;
    return `${h}sa ${m}dk`;
}

function escapeHTML(str = '') {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─────────────────────────────────────────────
//  BİLDİRİM ROZET SİSTEMİ
// ─────────────────────────────────────────────
function updateDMBadge(fromUid, count) {
    dmUnreadCounts[fromUid] = count;
    totalUnread = Object.values(dmUnreadCounts).reduce((a,b) => a+b, 0);

    // Kullanıcı listesindeki rozet
    const userEl = document.querySelector(`.user-item[data-uid="${fromUid}"]`);
    if (userEl) {
        let badge = userEl.querySelector('.dm-badge');
        if (count > 0) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'dm-badge';
                userEl.appendChild(badge);
            }
            badge.textContent = count;
        } else {
            badge?.remove();
        }
    }

    // Sol menüdeki ikon rozeti
    const navBadge = document.getElementById('nav-dm-badge');
    if (navBadge) {
        navBadge.textContent = totalUnread;
        navBadge.style.display = totalUnread > 0 ? 'flex' : 'none';
    }
}

// Koleksiyon ikonuna rozet ekle (yeni kart geldiğinde)
function setCollectionBadge(show) {
    const badge = document.getElementById('nav-collection-badge');
    if (badge) badge.style.display = show ? 'flex' : 'none';
}

// ─────────────────────────────────────────────
//  AUTH
// ─────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = 'mainpage.html'; return; }
    currentUser = user;

    const userRef  = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
        await setDoc(userRef, {
            email: user.email,
            displayName: user.displayName || user.email.split('@')[0],
            hc: 0, hp: 0, cardCount: 0,
            avatarSeed: user.uid,
            createdAt: serverTimestamp()
        });
    }
    currentUserDoc = (await getDoc(userRef)).data();

    const name   = currentUserDoc.displayName || user.email.split('@')[0];
    const avatar = `https://api.dicebear.com/7.x/notionists/svg?seed=${currentUserDoc.avatarSeed || user.uid}`;

    const setEl  = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const setImg = (id, s) => { const el = document.getElementById(id); if (el) el.src = s; };
    setEl('user-hc-balance', currentUserDoc.hc || 0);
    setEl('nav-user-name', name.toUpperCase());
    setEl('popover-name', name.toUpperCase());
    setImg('nav-avatar', avatar);
    setImg('nav-avatar-2', avatar);

    document.getElementById('nav-logout-btn')?.addEventListener('click', () =>
        signOut(auth).then(() => window.location.href = 'mainpage.html')
    );

    // DM unread dinle
    listenDMUnread();

    loadListings();
    loadRecentTrades();
    loadTrendCards();
});

// ─────────────────────────────────────────────
//  DM OKUNMADI DİNLEYİCİ
// ─────────────────────────────────────────────
function listenDMUnread() {
    if (!currentUser) return;
    // presence koleksiyonundaki tüm kullanıcılar için DM unread sayısını takip et
    onSnapshot(collection(db, 'presence'), (snap) => {
        snap.forEach(d => {
            const uid = d.id;
            if (uid === currentUser.uid) return;
            const dmId = [currentUser.uid, uid].sort().join('_');
            onSnapshot(
                query(collection(db, `dms/${dmId}/messages`),
                    where('senderId', '==', uid),
                    where('read', '==', false)
                ),
                (msgSnap) => {
                    updateDMBadge(uid, msgSnap.size);
                }
            );
        });
    });
}

// ─────────────────────────────────────────────
//  SEKSİYON GEÇİŞİ
// ─────────────────────────────────────────────
window.switchTab = function(tab) {
    ['pazar','sosyal','siralama'].forEach(t => {
        document.getElementById(`section-${t}`).style.display = 'none';
        document.getElementById(`tab-${t}`)?.classList.remove('active');
    });
    // Sosyal bölümü flex olarak aç (height chain için)
    document.getElementById(`section-${tab}`).style.display = tab === 'sosyal' ? 'flex' : 'block';
    document.getElementById(`tab-${tab}`)?.classList.add('active');

    if (tab === 'sosyal')   initChat();
    if (tab === 'siralama') loadLeaderboard('hp');
};

// ─────────────────────────────────────────────
//  PAZAR: İLANLARI YÜKLE
// ─────────────────────────────────────────────
async function loadListings() {
    const grid = document.getElementById('listings-grid');
    try {
        const snap = await getDocs(query(collection(db, 'marketListings'), orderBy('createdAt', 'desc')));
        allListings = [];
        snap.forEach(d => allListings.push({ id: d.id, ...d.data() }));
        allListings = allListings.filter(l => {
            if (!l.expiresAt) return true;
            const exp = l.expiresAt.toDate ? l.expiresAt.toDate() : new Date(l.expiresAt);
            return exp > new Date();
        });
        renderListings(allListings);
    } catch(e) {
        console.error(e);
        grid.innerHTML = `<div class="empty-grid"><span class="material-symbols-outlined">error</span>Yükleme hatası.</div>`;
    }
}

function renderListings(listings) {
    const grid = document.getElementById('listings-grid');
    if (!listings.length) {
        grid.innerHTML = `<div class="empty-grid"><span class="material-symbols-outlined">storefront</span>Henüz ilan yok. İlk ilanı sen aç!</div>`;
        return;
    }
    grid.innerHTML = listings.map(l => {
        const rColor = rarityColor(l.rarity);
        const isOwn  = currentUser && l.sellerId === currentUser.uid;
        const topBid = l.bids?.length ? Math.max(...l.bids.map(b => b.amount)) : null;

        const actionBtn = isOwn
            ? `<button class="btn-cancel-listing" onclick="cancelListing('${l.id}',event)">İPTAL</button>`
            : l.type === 'sabit'
                ? `<button class="btn-buy" onclick="openBuyModal('${l.id}',event)">SATIN AL</button>`
                : `<button class="btn-bid" onclick="openBuyModal('${l.id}',event)">TEKLİF VER</button>`;

        const priceLabel = l.type === 'artirma'
            ? (topBid ? `<span style="font-size:11px;color:#ff6b35;">En yüksek: </span>${topBid} HC` : `<span>Başlangıç:</span> ${l.price} HC`)
            : `${l.price} <span>HC</span>`;

        return `
            <div class="listing-card" data-id="${l.id}" data-rarity="${l.rarity||''}" data-type="${l.type||''}"
                 onclick="openCardDetailModal('${l.id}')">
                <img class="listing-card-img" src="${l.imageUrl}" alt="${l.cardName}" onerror="this.style.background='#1a1a1a'">
                <span class="listing-type-badge badge-${l.type}">${l.type === 'sabit' ? 'SABİT FİYAT' : 'ARTIRMA'}</span>
                <span class="listing-time-badge">${timeLeft(l.expiresAt)}</span>
                <div class="listing-info">
                    <div class="listing-rarity" style="color:${rColor}">${l.rarity}</div>
                    <div class="listing-name">${l.cardName}</div>
                    <div class="listing-seller">@${l.sellerName || 'koleksiyoncu'}</div>
                    <div class="listing-price-row">
                        <div class="listing-price">${priceLabel}</div>
                        <div onclick="event.stopPropagation()">${actionBtn}</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ─────────────────────────────────────────────
//  PAZAR: KART DETAY MODAL (tıklanabilir kart)
// ─────────────────────────────────────────────
window.openCardDetailModal = async function(listingId) {
    const listing = allListings.find(l => l.id === listingId);
    if (!listing) return;

    // Kart'ın tam verisini allCards'dan çek (hp, hc vs için)
    let cardExtra = {};
    try {
        if (listing.generalId) {
            const cardSnap = await getDocs(query(collection(db, 'allCards'), where('generalId', '==', listing.generalId)));
            if (!cardSnap.empty) cardExtra = cardSnap.docs[0].data();
        }
    } catch(e) {}

    const rColor = rarityColor(listing.rarity);
    const isOwn  = currentUser && listing.sellerId === currentUser.uid;
    const topBid = listing.bids?.length ? Math.max(...listing.bids.map(b => b.amount)) : null;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'card-detail-modal';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    const bidsHTML = listing.type === 'artirma' && listing.bids?.length ? `
        <div class="current-bids" style="margin-top:14px;">
            <h4 style="color:#555;font-size:11px;font-family:'Rajdhani',sans-serif;letter-spacing:2px;margin:0 0 8px;">MEVCUT TEKLİFLER</h4>
            ${[...listing.bids].sort((a,b)=>b.amount-a.amount).slice(0,5).map((b,i)=>`
                <div class="bid-row ${i===0?'top-bid':''}">
                    <span>@${escapeHTML(b.bidderName)}</span><span>${b.amount} HC</span>
                </div>
            `).join('')}
        </div>` : '';

    const actionSection = isOwn ? `
        <button class="btn-cancel-listing" style="width:100%;padding:12px;" onclick="cancelListing('${listingId}');document.getElementById('card-detail-modal')?.remove()">İLANI İPTAL ET</button>
    ` : listing.type === 'sabit' ? `
        <button class="btn-confirm-buy" onclick="document.getElementById('card-detail-modal').remove();openBuyModal('${listingId}')">
            SATIN AL — ${listing.price} HC
        </button>
    ` : `
        <div class="bid-input-row">
            <input type="number" id="detail-bid-amount"
                   placeholder="Min: ${(topBid||listing.price)+(listing.minBidIncrement||100)} HC"
                   min="${(topBid||listing.price)+(listing.minBidIncrement||100)}"
                   value="${(topBid||listing.price)+(listing.minBidIncrement||100)}">
            <button class="btn-confirm-bid" onclick="confirmBid('${listingId}','detail-bid-amount')">TEKLİF VER</button>
        </div>
        ${bidsHTML}
    `;

    modal.innerHTML = `
        <div class="modal-box" style="max-width:620px; padding:0; overflow:hidden;">
            <button class="modal-close" onclick="document.getElementById('card-detail-modal').remove()" style="z-index:2;">&times;</button>
            <div style="display:grid; grid-template-columns:220px 1fr;">
                <!-- Sol: Kart görseli -->
                <div style="background:#000; position:relative; min-height:300px; border-right:1px solid #1a1a1a;">
                    <img src="${listing.imageUrl}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;">
                    <div style="position:absolute;top:10px;left:10px;">
                        <span class="listing-type-badge badge-${listing.type}">${listing.type==='sabit'?'SABİT FİYAT':'ARTIRMA'}</span>
                    </div>
                    <div style="position:absolute;bottom:10px;right:10px;background:rgba(0,0,0,0.8);padding:4px 8px;border-radius:4px;font-family:'Rajdhani',sans-serif;font-size:11px;color:#aaa;">
                        ⏱ ${timeLeft(listing.expiresAt)}
                    </div>
                </div>
                <!-- Sağ: Bilgiler -->
                <div style="padding:28px 24px; display:flex; flex-direction:column; gap:14px;">
                    <div>
                        <div style="color:${rColor};font-size:11px;font-weight:900;letter-spacing:2px;font-family:'Rajdhani',sans-serif;">${listing.rarity}</div>
                        <div style="color:#fff;font-size:26px;font-weight:800;font-family:'Rajdhani',sans-serif;line-height:1.1;">${escapeHTML(listing.cardName)}</div>
                        <div style="color:#555;font-size:12px;font-family:'Rajdhani',sans-serif;">@${escapeHTML(listing.sellerName||'koleksiyoncu')}</div>
                    </div>

                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                        <div style="background:#141414;border:1px solid #1e1e1e;border-radius:8px;padding:10px 12px;">
                            <div style="color:#555;font-size:10px;font-weight:800;letter-spacing:1px;font-family:'Rajdhani',sans-serif;">HC DEĞERİ</div>
                            <div style="color:var(--gold,#f5c518);font-size:18px;font-weight:900;font-family:'Bebas Neue',sans-serif;">${cardExtra.hc || listing.hc || '-'}</div>
                        </div>
                        <div style="background:#141414;border:1px solid #1e1e1e;border-radius:8px;padding:10px 12px;">
                            <div style="color:#555;font-size:10px;font-weight:800;letter-spacing:1px;font-family:'Rajdhani',sans-serif;">HP GÜCÜ</div>
                            <div style="color:#ff6b35;font-size:18px;font-weight:900;font-family:'Bebas Neue',sans-serif;">${cardExtra.hp || listing.hp || '-'}</div>
                        </div>
                        <div style="background:#141414;border:1px solid #1e1e1e;border-radius:8px;padding:10px 12px;">
                            <div style="color:#555;font-size:10px;font-weight:800;letter-spacing:1px;font-family:'Rajdhani',sans-serif;">MEVKİ</div>
                            <div style="color:#fff;font-size:16px;font-weight:900;font-family:'Bebas Neue',sans-serif;">${cardExtra.pos || '-'}</div>
                        </div>
                        <div style="background:#141414;border:1px solid #1e1e1e;border-radius:8px;padding:10px 12px;">
                            <div style="color:#555;font-size:10px;font-weight:800;letter-spacing:1px;font-family:'Rajdhani',sans-serif;">SERİ</div>
                            <div style="color:#fff;font-size:14px;font-weight:700;font-family:'Rajdhani',sans-serif;">${cardExtra.series || listing.series || '-'}</div>
                        </div>
                    </div>

                    <div style="background:#141414;border-radius:8px;padding:12px 14px;border:1px solid #1e1e1e;">
                        <div style="color:#555;font-size:10px;font-weight:800;letter-spacing:1px;font-family:'Rajdhani',sans-serif;margin-bottom:4px;">
                            ${listing.type==='sabit'?'SATIŞ FİYATI':'BAŞLANGIÇ FİYATI'}
                        </div>
                        <div style="color:var(--gold,#f5c518);font-family:'Bebas Neue',sans-serif;font-size:28px;letter-spacing:1px;">
                            ${listing.type==='artirma' && topBid ? topBid : listing.price} HC
                            ${listing.type==='artirma' && topBid ? '<span style="font-size:12px;color:#555;font-family:\'Rajdhani\',sans-serif;"> (en yüksek teklif)</span>' : ''}
                        </div>
                    </div>

                    ${actionSection}
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
};

// ─────────────────────────────────────────────
//  PAZAR: FİLTRELE
// ─────────────────────────────────────────────
window.filterListings = function() {
    const search = document.getElementById('pazar-search').value.toLowerCase();
    const type   = document.getElementById('pazar-type').value;
    const rarity = document.getElementById('pazar-rarity').value;
    const sort   = document.getElementById('pazar-sort').value;

    let filtered = allListings.filter(l => {
        const matchSearch = !search || (l.cardName||'').toLowerCase().includes(search);
        const matchType   = !type   || l.type === type;
        const matchRarity = !rarity || (l.rarity||'').includes(rarity);
        return matchSearch && matchType && matchRarity;
    });

    if (sort === 'price-asc')  filtered.sort((a,b) => (a.price||0) - (b.price||0));
    if (sort === 'price-desc') filtered.sort((a,b) => (b.price||0) - (a.price||0));

    renderListings(filtered);
};

// ─────────────────────────────────────────────
//  PAZAR: İLAN ET MODAL
// ─────────────────────────────────────────────
window.openListModal = async function() {
    const modal = document.getElementById('list-modal');
    modal.style.display = 'flex';

    const sel = document.getElementById('select-card');
    sel.innerHTML = '<option value="">Yükleniyor...</option>';

    try {
        const snap = await getDocs(query(collection(db, 'userCards'), where('userId', '==', currentUser.uid)));
        const cards = [];
        snap.forEach(d => {
            const data = d.data();
            if (data.name && data.generalId && !data.isListed) cards.push({ id: d.id, ...data });
        });

        if (!cards.length) {
            sel.innerHTML = '<option value="">Satışa uygun kartın yok</option>';
            return;
        }

        sel.innerHTML = '<option value="">Kart seçin...</option>' +
            cards.map(c => `<option value="${c.id}"
                data-img="${c.imageUrl}" data-name="${c.name}"
                data-rarity="${c.rarity}" data-id="${c.generalId}"
                data-hp="${c.hp||0}" data-hc="${c.hc||0}"
            >${c.name} — ${c.rarity} #${c.generalId}</option>`).join('');

        sel.onchange = () => {
            const opt = sel.options[sel.selectedIndex];
            const preview = document.getElementById('selected-card-preview');
            if (!opt.value) { preview.style.display = 'none'; return; }
            const rColor = rarityColor(opt.dataset.rarity);
            preview.style.display = 'flex';
            preview.innerHTML = `
                <img src="${opt.dataset.img}" alt="" style="width:60px;height:80px;object-fit:cover;border-radius:6px;">
                <div style="flex:1;">
                    <div class="preview-rarity" style="color:${rColor}">${opt.dataset.rarity}</div>
                    <div class="preview-name">${opt.dataset.name}</div>
                    <div class="preview-id">#${opt.dataset.id}</div>
                    <div style="display:flex;gap:14px;margin-top:6px;">
                        <span style="font-size:11px;color:#555;font-family:'Rajdhani',sans-serif;">
                            HC: <span style="color:var(--gold,#f5c518);font-weight:800;">${opt.dataset.hc || '-'}</span>
                        </span>
                        <span style="font-size:11px;color:#555;font-family:'Rajdhani',sans-serif;">
                            HP: <span style="color:#ff6b35;font-weight:800;">${opt.dataset.hp || '-'}</span>
                        </span>
                    </div>
                </div>
            `;
        };
    } catch(e) { sel.innerHTML = '<option value="">Hata oluştu</option>'; }
};

window.closeListModal = function() {
    document.getElementById('list-modal').style.display = 'none';
};

window.setListType = function(type) {
    activeListType = type;
    document.getElementById('btn-sabit').classList.toggle('active', type === 'sabit');
    document.getElementById('btn-artirma').classList.toggle('active', type === 'artirma');
    document.getElementById('price-label').textContent = type === 'sabit' ? 'Satış Fiyatı (HC)' : 'Başlangıç Fiyatı (HC)';
    document.getElementById('min-bid-group').style.display = type === 'artirma' ? 'flex' : 'none';
};

window.confirmListing = async function() {
    const cardId   = document.getElementById('select-card').value;
    const price    = Number(document.getElementById('listing-price').value);
    const durHours = Number(document.getElementById('listing-duration').value);
    const minBid   = Number(document.getElementById('min-bid-increment').value) || 100;

    if (!cardId)  { alert('Kart seçin!'); return; }
    if (!price || price < 1) { alert('Geçerli bir fiyat girin!'); return; }

    try {
        const cardSnap = await getDoc(doc(db, 'userCards', cardId));
        if (!cardSnap.exists()) { alert('Kart bulunamadı!'); return; }
        const cardData = cardSnap.data();

        const expiresAt = new Date(Date.now() + durHours * 3600000);

        await addDoc(collection(db, 'marketListings'), {
            type: activeListType,
            cardId,
            cardName:        cardData.name,
            rarity:          cardData.rarity,
            imageUrl:        cardData.imageUrl,
            generalId:       cardData.generalId,
            hp:              cardData.hp || 0,
            hc:              cardData.hc || 0,
            series:          cardData.series || '',
            pos:             cardData.pos || '',
            sellerId:        currentUser.uid,
            sellerName:      currentUserDoc?.displayName || currentUser.email.split('@')[0],
            price,
            minBidIncrement: activeListType === 'artirma' ? minBid : null,
            bids:            [],
            status:          'active',
            createdAt:       serverTimestamp(),
            expiresAt
        });

        await updateDoc(doc(db, 'userCards', cardId), { isListed: true });

        alert('İlan yayınlandı!');
        closeListModal();
        loadListings();
    } catch(e) { alert('Hata: ' + e.message); }
};

// ─────────────────────────────────────────────
//  PAZAR: SATIN AL MODAL (sabit fiyat)
// ─────────────────────────────────────────────
window.openBuyModal = async function(listingId, e) {
    if (e) e.stopPropagation();
    const listing = allListings.find(l => l.id === listingId);
    if (!listing) return;

    const rColor = rarityColor(listing.rarity);
    const topBid = listing.bids?.length ? Math.max(...listing.bids.map(b => b.amount)) : null;

    // Kullanıcı zaten bu kartı satın almış mı? (aynı generalId)
    let alreadyOwns = false;
    try {
        const ownSnap = await getDocs(query(
            collection(db, 'userCards'),
            where('userId', '==', currentUser.uid),
            where('generalId', '==', listing.generalId)
        ));
        alreadyOwns = !ownSnap.empty;
    } catch(e) {}

    const modal   = document.getElementById('buy-modal');
    const content = document.getElementById('buy-modal-content');

    if (listing.type === 'sabit') {
        const ownsWarning = alreadyOwns ? `
            <div style="background:#1a0f00;border:1px solid #ff6b35;border-radius:8px;padding:12px 14px;margin-bottom:14px;display:flex;align-items:center;gap:10px;">
                <span class="material-symbols-outlined" style="color:#ff6b35;font-size:20px;">warning</span>
                <span style="color:#ff6b35;font-size:12px;font-family:'Rajdhani',sans-serif;font-weight:700;">
                    Bu karta zaten sahipsiniz! Yine de satın almak ister misiniz?
                </span>
            </div>` : '';

        content.innerHTML = `
            <h2>SATIN <span>AL</span></h2>
            <div class="buy-card-preview">
                <img src="${listing.imageUrl}" alt="">
                <div class="buy-card-info">
                    <div class="buy-card-rarity" style="color:${rColor}">${listing.rarity}</div>
                    <div class="buy-card-name">${escapeHTML(listing.cardName)}</div>
                    <div class="buy-detail"><span>Satıcı</span><span>@${escapeHTML(listing.sellerName)}</span></div>
                    <div class="buy-detail"><span>Kart ID</span><span>#${listing.generalId}</span></div>
                    <div class="buy-detail"><span>Süre</span><span>${timeLeft(listing.expiresAt)}</span></div>
                    <div class="buy-detail"><span>HC Değeri</span><span style="color:var(--gold)">${listing.hc || '-'}</span></div>
                    <div class="buy-detail"><span>HP Gücü</span><span style="color:#ff6b35">${listing.hp || '-'}</span></div>
                </div>
            </div>
            ${ownsWarning}
            <div class="buy-price-row">
                <span class="buy-price-label">SATIŞ FİYATI</span>
                <span class="buy-price-val">${listing.price} HC</span>
            </div>
            <div style="background:#0f0a00;border:1px solid #2a2000;border-radius:8px;padding:10px 14px;margin:12px 0;font-size:11px;color:#888;font-family:'Rajdhani',sans-serif;line-height:1.6;">
                ⚠️ <strong style="color:#aaa;">Not:</strong> Bu işlem şu an simüle edilmiştir. HC'niz düşülecek, kart koleksiyonunuza eklenecektir.
            </div>
            <div class="buy-btns">
                <button class="btn-confirm-buy" onclick="confirmBuy('${listingId}')">✓ SATIN AL (${listing.price} HC)</button>
            </div>
        `;
    } else {
        const minNext = (topBid || listing.price) + (listing.minBidIncrement || 100);
        const bidsHTML = listing.bids?.length ? `
            <div class="current-bids">
                <h4>MEVCUT TEKLİFLER</h4>
                ${[...listing.bids].sort((a,b)=>b.amount-a.amount).slice(0,5).map((b,i)=>`
                    <div class="bid-row ${i===0?'top-bid':''}">
                        <span>@${escapeHTML(b.bidderName)}</span><span>${b.amount} HC</span>
                    </div>
                `).join('')}
            </div>` : '';

        content.innerHTML = `
            <h2>TEKLİF <span>VER</span></h2>
            <div class="buy-card-preview">
                <img src="${listing.imageUrl}" alt="">
                <div class="buy-card-info">
                    <div class="buy-card-rarity" style="color:${rColor}">${listing.rarity}</div>
                    <div class="buy-card-name">${escapeHTML(listing.cardName)}</div>
                    <div class="buy-detail"><span>Satıcı</span><span>@${escapeHTML(listing.sellerName)}</span></div>
                    <div class="buy-detail"><span>Süre</span><span>${timeLeft(listing.expiresAt)}</span></div>
                    <div class="buy-detail"><span>En Yüksek Teklif</span><span style="color:#ff6b35">${topBid ? topBid+' HC' : 'Teklif yok'}</span></div>
                    <div class="buy-detail"><span>HC Değeri</span><span style="color:var(--gold)">${listing.hc || '-'}</span></div>
                    <div class="buy-detail"><span>HP Gücü</span><span style="color:#ff6b35">${listing.hp || '-'}</span></div>
                </div>
            </div>
            <div style="background:#0f0a00;border:1px solid #2a2000;border-radius:8px;padding:10px 14px;margin:8px 0;font-size:11px;color:#888;font-family:'Rajdhani',sans-serif;line-height:1.6;">
                ⚠️ Teklif verdiğinizde HC'niz hemen düşülür. Üstünüze çıkılırsa veya ilan iptal edilirse HC'niz iade edilir.
            </div>
            <div class="bid-input-row">
                <input type="number" id="bid-amount" placeholder="Min: ${minNext} HC" min="${minNext}" value="${minNext}">
                <button class="btn-confirm-bid" onclick="confirmBid('${listingId}')">TEKLİF VER</button>
            </div>
            ${bidsHTML}
        `;
    }

    modal.style.display = 'flex';
};

// ─────────────────────────────────────────────
//  PAZAR: SATIN AL
// ─────────────────────────────────────────────
window.confirmBuy = async function(listingId) {
    const listing = allListings.find(l => l.id === listingId);
    if (!listing) return;
    if (listing.sellerId === currentUser.uid) { alert('Kendi ilanını satın alamazsın!'); return; }

    if (!confirm(`${listing.cardName} kartını ${listing.price} HC karşılığında satın almak istediğinize emin misiniz?\n\nKart koleksiyonunuza eklenecektir.`)) return;

    const userRef  = doc(db, 'users', currentUser.uid);
    const userSnap = await getDoc(userRef);
    const balance  = userSnap.data()?.hc || 0;

    if (balance < listing.price) { alert(`Yetersiz HC! Bakiye: ${balance} HC`); return; }

    try {
        // HC düş
        await updateDoc(userRef, { hc: increment(-listing.price) });
        // Satıcıya HC ekle
        await updateDoc(doc(db, 'users', listing.sellerId), { hc: increment(listing.price) });

        // Kartı alıcıya kopyala
        const cardSnap = await getDoc(doc(db, 'userCards', listing.cardId));
        const newKey   = `${currentUser.uid}_${listing.cardId}_${Date.now()}`;
        const baseData = cardSnap.exists() ? cardSnap.data() : {
            name: listing.cardName, rarity: listing.rarity,
            imageUrl: listing.imageUrl, generalId: listing.generalId,
            hp: listing.hp || 0, hc: listing.hc || 0
        };
        await setDoc(doc(db, 'userCards', newKey), {
            ...baseData,
            userId:     currentUser.uid,
            ownerEmail: currentUser.email,
            isListed:   false,
            obtainedAt: serverTimestamp(),
            source:     'Pazar Alımı'
        });

        // Orijinal kartı sil (satıcının elinden çık)
        if (cardSnap.exists()) await deleteDoc(doc(db, 'userCards', listing.cardId));

        // İlanı sil
        await deleteDoc(doc(db, 'marketListings', listingId));

        // Trade kaydı
        await addDoc(collection(db, 'recentTrades'), {
            cardName:   listing.cardName,
            imageUrl:   listing.imageUrl,
            rarity:     listing.rarity,
            price:      listing.price,
            buyerName:  currentUserDoc?.displayName || 'Koleksiyoncu',
            sellerName: listing.sellerName,
            tradeAt:    serverTimestamp()
        });

        // Koleksiyon rozeti göster
        setCollectionBadge(true);

        document.getElementById('buy-modal').style.display = 'none';
        document.getElementById('user-hc-balance').textContent = balance - listing.price;
        alert(`✅ ${listing.cardName} başarıyla satın alındı! Koleksiyonunuza eklendi.`);
        loadListings();
        loadRecentTrades();
    } catch(e) { alert('İşlem hatası: ' + e.message); console.error(e); }
};

// ─────────────────────────────────────────────
//  PAZAR: TEKLİF VER (HC anında düşer)
// ─────────────────────────────────────────────
window.confirmBid = async function(listingId, inputId = 'bid-amount') {
    const listing = allListings.find(l => l.id === listingId);
    if (!listing) return;
    if (listing.sellerId === currentUser.uid) { alert('Kendi ilanına teklif veremezsin!'); return; }

    const amount = Number(document.getElementById(inputId)?.value || document.getElementById('bid-amount')?.value);
    const topBid = listing.bids?.length ? Math.max(...listing.bids.map(b => b.amount)) : listing.price - 1;
    const minNext = topBid + (listing.minBidIncrement || 100);

    if (!amount || amount < minNext) { alert(`Minimum teklif: ${minNext} HC`); return; }

    const userRef  = doc(db, 'users', currentUser.uid);
    const userSnap = await getDoc(userRef);
    const balance  = userSnap.data()?.hc || 0;

    if (balance < amount) { alert(`Yetersiz HC! Bakiye: ${balance} HC`); return; }

    // Kullanıcının önceki teklifi var mı? Varsa geri öde
    const prevBid = listing.bids?.find(b => b.bidderId === currentUser.uid);
    const prevAmount = prevBid ? prevBid.amount : 0;

    const netCost = amount - prevAmount; // Fark kadar düş

    try {
        // HC düş (net fark)
        await updateDoc(userRef, { hc: increment(-netCost) });

        // Önceki teklifi kaldır, yeni ekle
        if (prevBid) {
            await updateDoc(doc(db, 'marketListings', listingId), { bids: arrayRemove(prevBid) });
        }

        const bid = {
            bidderId:   currentUser.uid,
            bidderName: currentUserDoc?.displayName || 'Koleksiyoncu',
            amount,
            hcLocked:   amount,
            bidAt:      new Date().toISOString()
        };
        await updateDoc(doc(db, 'marketListings', listingId), { bids: arrayUnion(bid) });

        // Local cache güncelle
        const idx = allListings.findIndex(l => l.id === listingId);
        if (idx !== -1) {
            allListings[idx].bids = [
                ...(allListings[idx].bids || []).filter(b => b.bidderId !== currentUser.uid),
                bid
            ];
        }

        document.getElementById('buy-modal').style.display = 'none';
        document.getElementById('card-detail-modal')?.remove();
        document.getElementById('user-hc-balance').textContent = balance - netCost;
        alert(`✅ ${amount} HC teklif verildi! HC'niz kilitlendi.`);
        loadListings();
    } catch(e) { alert('Teklif hatası: ' + e.message); }
};

// ─────────────────────────────────────────────
//  PAZAR: İLAN İPTAL (teklif HC'leri iade et)
// ─────────────────────────────────────────────
window.cancelListing = async function(listingId, e) {
    if (e) e?.stopPropagation();
    if (!confirm('İlanı iptal etmek istiyor musun?')) return;
    try {
        const listing = allListings.find(l => l.id === listingId);
        if (!listing) return;

        // Açık artırmada teklif verenlerin HC'sini iade et
        if (listing.type === 'artirma' && listing.bids?.length) {
            for (const bid of listing.bids) {
                if (bid.bidderId && bid.amount) {
                    await updateDoc(doc(db, 'users', bid.bidderId), { hc: increment(bid.amount) });
                }
            }
        }

        if (listing.cardId) {
            await updateDoc(doc(db, 'userCards', listing.cardId), { isListed: false });
        }
        await deleteDoc(doc(db, 'marketListings', listingId));
        loadListings();
    } catch(e) { alert('İptal hatası: ' + e.message); }
};

// ─────────────────────────────────────────────
//  SON İŞLEMLER
// ─────────────────────────────────────────────
async function loadRecentTrades() {
    const container = document.getElementById('recent-trades');
    try {
        const snap = await getDocs(query(collection(db, 'recentTrades'), orderBy('tradeAt', 'desc'), limit(5)));
        if (snap.empty) { container.innerHTML = '<p class="empty-note">Henüz işlem yok.</p>'; return; }
        container.innerHTML = '';
        snap.forEach(d => {
            const t = d.data();
            const rColor = rarityColor(t.rarity);
            container.innerHTML += `
                <div class="trade-item">
                    <img src="${t.imageUrl}" alt="">
                    <div class="trade-info">
                        <div class="trade-name" style="color:${rColor}">${t.cardName}</div>
                        <div class="trade-detail">@${t.sellerName} → @${t.buyerName}</div>
                        <div class="trade-detail">${timeAgo(t.tradeAt)}</div>
                    </div>
                    <div class="trade-price">${t.price} HC</div>
                </div>
            `;
        });
    } catch(e) { console.error(e); }
}

// ─────────────────────────────────────────────
//  TREND KARTLAR
// ─────────────────────────────────────────────
async function loadTrendCards() {
    const container = document.getElementById('trend-cards');
    try {
        const snap = await getDocs(query(collection(db, 'marketListings'), orderBy('createdAt', 'desc'), limit(10)));
        const listings = [];
        snap.forEach(d => listings.push({ id: d.id, ...d.data() }));
        const sorted = listings.sort((a,b) => (b.bids?.length||0) - (a.bids?.length||0)).slice(0,5);

        if (!sorted.length) { container.innerHTML = '<p class="empty-note">Aktif ilan yok.</p>'; return; }
        container.innerHTML = sorted.map((l,i) => `
            <div class="trend-item" onclick="openCardDetailModal('${l.id}')">
                <span class="trend-rank">${i+1}</span>
                <img class="trend-img" src="${l.imageUrl}" alt="">
                <span class="trend-name">${escapeHTML(l.cardName)}</span>
                <span class="trend-count">${l.bids?.length||0} teklif</span>
            </div>
        `).join('');
    } catch(e) { console.error(e); }
}

// ─────────────────────────────────────────────
//  SOHBET
// ─────────────────────────────────────────────
async function initChat() {
    loadOnlineUsers();
    if (chatUnsub) chatUnsub();
    const messagesEl = document.getElementById('chat-messages');
    messagesEl.innerHTML = '';

    chatUnsub = onSnapshot(
        query(collection(db, 'globalChat'), orderBy('sentAt', 'asc'), limit(80)),
        (snap) => {
            const bottom = messagesEl.scrollHeight - messagesEl.scrollTop <= messagesEl.clientHeight + 60;
            snap.docChanges().forEach(change => {
                if (change.type !== 'added') return;
                const msg   = change.doc.data();
                const msgId = change.doc.id;
                const isOwn = msg.senderId === currentUser?.uid;
                const avatar = `https://api.dicebear.com/7.x/notionists/svg?seed=${msg.senderSeed||msg.senderId}`;

                const el = document.createElement('div');
                el.className = `chat-msg ${isOwn?'own':''}`;
                el.dataset.msgId = msgId;
                el.innerHTML = `
                    <img class="chat-msg-avatar" src="${avatar}" alt="">
                    <div class="chat-msg-body">
                        <div class="chat-msg-meta">
                            <span class="chat-msg-name">${escapeHTML(msg.senderName)}</span>
                            <span class="chat-msg-time">${timeAgo(msg.sentAt)}</span>
                        </div>
                        <div class="chat-msg-text" data-id="${msgId}"
                             onmouseenter="${isOwn?`showRecall(this,'${msgId}')`:''}">
                            ${escapeHTML(msg.text)}
                            ${isOwn ? `<button class="recall-btn" onclick="recallMessage('${msgId}',event)" title="Mesajı geri al">✕</button>` : ''}
                        </div>
                    </div>
                `;
                messagesEl.appendChild(el);
            });
            if (bottom) messagesEl.scrollTop = messagesEl.scrollHeight;
        }
    );
}

window.sendMessage = async function() {
    const input = document.getElementById('chat-input');
    const text  = input.value.trim();
    if (!text || !currentUser) return;
    input.value = '';
    try {
        await addDoc(collection(db, 'globalChat'), {
            text,
            senderId:   currentUser.uid,
            senderName: currentUserDoc?.displayName || currentUser.email.split('@')[0],
            senderSeed: currentUserDoc?.avatarSeed || currentUser.uid,
            sentAt:     serverTimestamp()
        });
    } catch(e) { console.error(e); }
};

window.handleChatKey = function(e) {
    if (e.key === 'Enter') window.sendMessage();
};

// Mesajı geri al
window.recallMessage = async function(msgId, e) {
    if (e) e.stopPropagation();
    if (!confirm('Bu mesajı geri almak istiyor musun?')) return;
    try {
        await deleteDoc(doc(db, 'globalChat', msgId));
        // DOM'dan kaldır
        document.querySelector(`.chat-msg[data-msg-id="${msgId}"]`)?.remove();
        document.querySelectorAll(`[data-id="${msgId}"]`).forEach(el => el.closest('.chat-msg')?.remove());
    } catch(e) { alert('Geri alma hatası: ' + e.message); }
};

// ─────────────────────────────────────────────
//  ONLINE KULLANICILAR
// ─────────────────────────────────────────────
async function loadOnlineUsers() {
    const container = document.getElementById('users-list');
    try {
        await setDoc(doc(db, 'presence', currentUser.uid), {
            uid:      currentUser.uid,
            name:     currentUserDoc?.displayName || currentUser.email.split('@')[0],
            seed:     currentUserDoc?.avatarSeed || currentUser.uid,
            lastSeen: serverTimestamp()
        }, { merge: true });

        const tenMinAgo = new Date(Date.now() - 10 * 60000);
        const snap = await getDocs(collection(db, 'presence'));
        const users = [];
        snap.forEach(d => {
            const data = d.data();
            const lastSeen = data.lastSeen?.toDate ? data.lastSeen.toDate() : new Date(0);
            if (lastSeen > tenMinAgo) users.push({ id: d.id, ...data });
        });

        document.getElementById('online-count').textContent = `${users.length} çevrimiçi`;

        container.innerHTML = users.map(u => {
            const avatar = `https://api.dicebear.com/7.x/notionists/svg?seed=${u.seed||u.uid}`;
            const isMe   = u.uid === currentUser.uid;
            const unread = dmUnreadCounts[u.uid] || 0;
            return `
                <div class="user-item" data-uid="${u.uid}" onclick="${isMe ? '' : `openDM('${u.uid}','${escapeHTML(u.name)}')`}" style="${isMe?'':'cursor:pointer;'}">
                    <img src="${avatar}" alt="">
                    <div class="user-item-info">
                        <div class="user-item-name">${escapeHTML(u.name)} ${isMe ? '<span style="color:#555;font-size:10px;">(Sen)</span>' : ''}</div>
                        <div class="user-item-status">Çevrimiçi</div>
                    </div>
                    <div class="user-item-online"></div>
                    ${unread > 0 ? `<span class="dm-badge">${unread}</span>` : ''}
                </div>
            `;
        }).join('') || '<p class="empty-note">Aktif kullanıcı yok.</p>';
    } catch(e) { console.error(e); }
}

// ─────────────────────────────────────────────
//  ÖZEL MESAJ
// ─────────────────────────────────────────────
window.openDM = async function(uid, name) {
    dmTargetId   = uid;
    dmTargetName = name;
    document.getElementById('dm-target-name').textContent = name;
    document.getElementById('dm-panel').style.display = 'flex';

    // Okunmadı sayısını sıfırla
    updateDMBadge(uid, 0);

    if (dmUnsub) dmUnsub();
    const dmMessages = document.getElementById('dm-messages');
    dmMessages.innerHTML = '';

    const dmId = [currentUser.uid, uid].sort().join('_');

    // Mesajları okundu olarak işaretle
    try {
        const unreadSnap = await getDocs(query(
            collection(db, `dms/${dmId}/messages`),
            where('senderId', '==', uid),
            where('read', '==', false)
        ));
        for (const d of unreadSnap.docs) {
            await updateDoc(doc(db, `dms/${dmId}/messages`, d.id), { read: true });
        }
    } catch(e) {}

    dmUnsub = onSnapshot(
        query(collection(db, `dms/${dmId}/messages`), orderBy('sentAt', 'asc'), limit(50)),
        (snap) => {
            snap.docChanges().forEach(change => {
                if (change.type !== 'added') return;
                const msg   = change.doc.data();
                const msgId = change.doc.id;
                const isOwn = msg.senderId === currentUser.uid;
                const el    = document.createElement('div');
                el.className = `chat-msg ${isOwn?'own':''}`;
                el.innerHTML = `
                    <img class="chat-msg-avatar" src="https://api.dicebear.com/7.x/notionists/svg?seed=${msg.senderSeed||msg.senderId}" alt="">
                    <div class="chat-msg-body">
                        <div class="chat-msg-meta">
                            <span class="chat-msg-name">${escapeHTML(msg.senderName)}</span>
                            <span class="chat-msg-time">${timeAgo(msg.sentAt)}</span>
                        </div>
                        <div class="chat-msg-text">
                            ${escapeHTML(msg.text)}
                            ${isOwn ? `<button class="recall-btn" onclick="recallDM('${dmId}','${msgId}',event)" title="Geri al">✕</button>` : ''}
                        </div>
                    </div>
                `;
                dmMessages.appendChild(el);
                dmMessages.scrollTop = dmMessages.scrollHeight;
            });
        }
    );
};

window.recallDM = async function(dmId, msgId, e) {
    if (e) e.stopPropagation();
    if (!confirm('Bu mesajı geri almak istiyor musun?')) return;
    try {
        await deleteDoc(doc(db, `dms/${dmId}/messages`, msgId));
    } catch(e) { alert('Geri alma hatası: ' + e.message); }
};

window.closeDM = function() {
    if (dmUnsub) { dmUnsub(); dmUnsub = null; }
    dmTargetId = null;
    document.getElementById('dm-panel').style.display = 'none';
};

window.sendDM = async function() {
    const input = document.getElementById('dm-input');
    const text  = input.value.trim();
    if (!text || !dmTargetId) return;
    input.value = '';
    const dmId = [currentUser.uid, dmTargetId].sort().join('_');
    try {
        await addDoc(collection(db, `dms/${dmId}/messages`), {
            text,
            senderId:   currentUser.uid,
            senderName: currentUserDoc?.displayName || currentUser.email.split('@')[0],
            senderSeed: currentUserDoc?.avatarSeed || currentUser.uid,
            sentAt:     serverTimestamp(),
            read:       false
        });
    } catch(e) { console.error(e); }
};

window.handleDMKey = function(e) {
    if (e.key === 'Enter') window.sendDM();
};

// ─────────────────────────────────────────────
//  SIRALAMA
// ─────────────────────────────────────────────
window.switchLeaderboard = function(type) {
    ['hp','cards','hc'].forEach(t => {
        document.getElementById(`stab-${t}`)?.classList.toggle('active', t === type);
    });
    loadLeaderboard(type);
};

async function loadLeaderboard(type) {
    const podium = document.getElementById('podium');
    const list   = document.getElementById('leaderboard-list');
    list.innerHTML = '<div class="loading-state"><span class="material-symbols-outlined spin">sync</span><p>Hesaplanıyor...</p></div>';

    try {
        const fieldMap = { hp: 'hp', cards: 'cardCount', hc: 'hc' };
        const labelMap = { hp: 'HP', cards: 'Kart', hc: 'HC' };
        const field = fieldMap[type];
        const label = labelMap[type];

        const snap = await getDocs(query(collection(db, 'users'), orderBy(field, 'desc'), limit(20)));
        const users = [];
        snap.forEach(d => users.push({ id: d.id, ...d.data() }));

        if (!users.length) {
            podium.innerHTML = '';
            list.innerHTML = '<div class="loading-state"><p>Kullanıcı bulunamadı.</p></div>';
            return;
        }

        const top3   = users.slice(0, 3);
        const medals = ['🥇','🥈','🥉'];
        // Görsel sıralama: 2. solda, 1. ortada, 3. sağda
        const displayOrder = top3.length >= 3 ? [1, 0, 2] : top3.map((_,i) => i);

        podium.innerHTML = displayOrder.map(i => {
            if (!top3[i]) return '';
            const u      = top3[i];
            const avatar = `https://api.dicebear.com/7.x/notionists/svg?seed=${u.avatarSeed||u.id}`;
            const score  = u[field] || 0;
            const rank   = i + 1;
            const podCls = rank === 1 ? 'first' : rank === 2 ? 'second' : 'third';
            return `
                <div class="podium-item ${podCls}">
                    ${rank === 1 ? '<div class="podium-crown">👑</div>' : ''}
                    <div class="podium-avatar"><img src="${avatar}" alt=""></div>
                    <div class="podium-name">${escapeHTML(u.displayName || u.email?.split('@')[0] || '?')}</div>
                    <div class="podium-score">${score.toLocaleString()} <span style="font-size:14px;color:#555;">${label}</span></div>
                    <div class="podium-rank">${medals[i]}</div>
                </div>
            `;
        }).join('');

        list.innerHTML = users.map((u, idx) => {
            const avatar  = `https://api.dicebear.com/7.x/notionists/svg?seed=${u.avatarSeed||u.id}`;
            const isMe    = u.id === currentUser?.uid;
            const score   = u[field] || 0;
            const rank    = idx + 1;
            const rankCls = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
            return `
                <div class="lb-item ${isMe?'me':''}">
                    <div class="lb-rank ${rankCls}">${rank}</div>
                    <div class="lb-avatar"><img src="${avatar}" alt=""></div>
                    <div class="lb-info">
                        <div class="lb-name">${escapeHTML(u.displayName || u.email?.split('@')[0] || '?')} ${isMe?'<span style="color:var(--gold);font-size:10px;">◀ SEN</span>':''}</div>
                        <div class="lb-sub">${u.email || ''}</div>
                    </div>
                    <div class="lb-score">${score.toLocaleString()} <span>${label}</span></div>
                </div>
            `;
        }).join('');
    } catch(e) {
        console.error(e);
        list.innerHTML = '<div class="loading-state"><p>Yükleme hatası.</p></div>';
    }
}
