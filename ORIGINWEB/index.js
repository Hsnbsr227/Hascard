onAuthStateChanged(auth, (user) => {
    // Seçicileri senin verdiğin class ve id isimlerine göre sabitledim
    const loginLink = document.querySelector('.nav-login-link'); // Giriş Yap linki
    const registerBtn = document.getElementById('nav-register-btn'); // Kayıt Ol butonu
    const userProfile = document.getElementById('user-profile'); // Profil dairesi

    if (user) {
        // Kullanıcı giriş yapmışsa her iki butonu da gizle
        if (loginLink) loginLink.style.display = 'none';
        if (registerBtn) registerBtn.style.display = 'none';
        
        // Profil kısmını göster
        if (userProfile) userProfile.style.display = 'flex';
        
        // Profil baş harfini güncelle
        const userInitial = document.getElementById('user-initial');
        if (userInitial) userInitial.innerText = user.email.charAt(0).toUpperCase();
    } else {
        // Kullanıcı çıkış yapmışsa butonları geri getir, profili gizle
        if (loginLink) loginLink.style.display = 'inline-flex';
        if (registerBtn) registerBtn.style.display = 'inline-flex';
        if (userProfile) userProfile.style.display = 'none';
    }
});