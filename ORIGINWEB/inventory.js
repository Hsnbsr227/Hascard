import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, query, where, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const inventoryGrid = document.getElementById('inventory-grid');
const userInitial = document.getElementById('user-initial');
const userEmailText = document.getElementById('user-email-display');
const cardCountText = document.getElementById('card-count');

onAuthStateChanged(auth, async (user) => {
    if (user) {
        if (userInitial) userInitial.innerText = user.email.charAt(0).toUpperCase();
        if (userEmailText) userEmailText.innerText = user.email;
        loadUserCards(user.uid);
    } else {
        window.location.href = "login.html";
    }
});

async function loadUserCards(uid) {
    try {
        const q = query(collection(db, "userCards"), where("ownerId", "==", uid));
        const querySnapshot = await getDocs(q);
        
        inventoryGrid.innerHTML = ""; 

        if (cardCountText) {
            cardCountText.innerText = `TOPLAM ${querySnapshot.size} NADİR KART BULUNDU.`;
        }

        if (querySnapshot.empty) {
            inventoryGrid.innerHTML = "<p style='color:white;'>Henüz hiç kartın yok. Pazar yerine göz at!</p>";
            return;
        }

        querySnapshot.forEach((cardDoc) => {
            const card = cardDoc.data();
            const cardId = cardDoc.id;

            // Veri Temizliği (Tırnak ve Boşluk Engelleme)
            const name = (card.name || "İsimsiz").replace(/"/g, "");
            const rarity = (card.rarity || "STANDART").replace(/"/g, "");
            const imgUrl = (card.imageUrl || "").replace(/"/g, "").trim();
            const gId = (card.generalId || "000").replace(/"/g, "");
            const marketValue = card.marketValue || 1000; // Eğer veritabanında yoksa varsayılan 1000 TL

            inventoryGrid.innerHTML += `
                <div class="card-box">
                    <div class="rarity-tag">${rarity}</div>
                    <img src="${imgUrl}" alt="${name}" onerror="this.src='https://via.placeholder.com/250x350?text=Resim+Yok'">
                    <div class="card-info">
                        <h3>${name}</h3>
                        <p style="font-size: 11px; color: #8a8fb5; margin: 5px 0;">GENEL NO: #${gId}</p>
                        <span>LİMİTED: ${card.limitedNo || 0} / ${card.maxSupply || 5}</span>
                        
                        <button class="sell-btn" onclick="openSellPanel('${cardId}', '${name}', '${rarity}', ${marketValue})">
                            ${card.isListing ? 'Fiyat Güncelle' : 'PAZARDA SAT'}
                        </button>
                    </div>
                </div>
            `;
        });
    } catch (error) {
        console.error("Yükleme hatası:", error);
    }
}

// --- SATIŞ PANELİ FONKSİYONU ---
window.openSellPanel = async (cardId, name, rarity, marketValue) => {
    const maxAllowed = marketValue * 1.05; // %5 kuralı
    
    const promptMsg = `--- SATIŞ PANELİ ---\n\n` +
                      `Kart: ${name}\n` +
                      `Nadirlik: ${rarity}\n` +
                      `Piyasa Değeri: ${marketValue} TL\n` +
                      `Maksimum Satış: ${maxAllowed.toFixed(2)} TL\n\n` +
                      `Satmak istediğiniz fiyatı girin:`;

    const userInput = prompt(promptMsg);

    if (userInput === null) return; // İptal

    const price = parseFloat(userInput);

    if (isNaN(price) || price <= 0) {
        alert("Geçersiz fiyat girdiniz!");
        return;
    }

    if (price > maxAllowed) {
        alert(`HATA! Piyasa değerinin en fazla %5 üstüne çıkabilirsiniz.\nSınır: ${maxAllowed.toFixed(2)} TL`);
        return;
    }

    try {
        const cardRef = doc(db, "userCards", cardId);
        await updateDoc(cardRef, {
            price: price,
            isListing: true
        });
        alert("Kart başarıyla pazar listesine eklendi!");
        location.reload();
    } catch (err) {
        alert("Güncelleme sırasında hata oluştu!");
        console.error(err);
    }
};

// Çıkış Butonu
document.getElementById('logout-btn')?.addEventListener('click', () => {
    signOut(auth).then(() => window.location.href = "index.html");
});