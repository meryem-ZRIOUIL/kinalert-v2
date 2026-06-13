// ============================================
// KINALERT - SCAN (Caméra + OCR → Pipeline IA)
// ============================================

let currentStream = null;

// -----------------------------------------------
// ÉTAPE 1 : Caméra → Photo → OCR
// -----------------------------------------------
async function initScan(port) {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        currentStream = stream;

        const video = document.createElement('video');
        video.srcObject = stream;
        video.setAttribute('playsinline', '');
        video.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; object-fit:cover; z-index:10000; background:#000;';

        const captureBtn = document.createElement('button');
        captureBtn.innerHTML = '📷 PRENDRE PHOTO';
        captureBtn.style.cssText = `
            position:fixed; bottom:30px; left:50%; transform:translateX(-50%);
            z-index:10001; padding:14px 28px; background:#1e6f3f; color:white;
            border:none; border-radius:40px; font-weight:bold; font-size:16px; cursor:pointer;`;

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '❌ ANNULER';
        closeBtn.style.cssText = `
            position:fixed; top:20px; right:20px; z-index:10001;
            padding:10px 20px; background:#e74c3c; color:white;
            border:none; border-radius:40px; cursor:pointer;`;

        document.body.appendChild(video);
        document.body.appendChild(captureBtn);
        document.body.appendChild(closeBtn);
        video.play();

        // Attendre que la vidéo soit prête
        await new Promise(r => { video.onloadedmetadata = r; });

        captureBtn.onclick = async () => {
            // Capturer l'image dans un canvas
            const canvas = document.createElement('canvas');
            canvas.width  = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext('2d').drawImage(video, 0, 0);

            // Arrêter la caméra et nettoyer l'UI
            stopCamera();
            video.remove(); captureBtn.remove(); closeBtn.remove();

            // ── ÉTAPE 2 : OCR sur la photo ──
            await lancerOCR(canvas, port);
        };

        closeBtn.onclick = () => {
            stopCamera();
            video.remove(); captureBtn.remove(); closeBtn.remove();
        };

    } catch (error) {
        console.error('Erreur caméra:', error);
        if (typeof showToast === 'function') showToast('❌ Impossible d\'accéder à la caméra');
        else alert('❌ Impossible d\'accéder à la caméra.');
    }
}

function stopCamera() {
    if (currentStream) {
        currentStream.getTracks().forEach(t => t.stop());
        currentStream = null;
    }
}

// -----------------------------------------------
// ÉTAPE 1b : Upload fichier → OCR ou texte direct
// Supporte image, texte brut
// -----------------------------------------------
async function uploadNotice(port) {
    const input = document.createElement('input');
    input.type   = 'file';
    input.accept = 'image/*,text/plain';

    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const noticeDiv = document.getElementById(`noticeResult${port}`);
        if (noticeDiv) {
            noticeDiv.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Lecture du fichier...';
            noticeDiv.style.background = '#f0f9ff';
        }
        if (typeof showToast === 'function') showToast(`📁 Lecture de ${file.name}...`);

        try {
            if (file.type === 'text/plain') {
                // ── Texte brut : passer directement à Groq ──
                const text = await file.text();
                if (noticeDiv) {
                    noticeDiv.innerHTML = `📄 Fichier texte chargé (${text.length} car.). Analyse IA...`;
                    noticeDiv.style.background = '#f0f9ff';
                }
                // ── ÉTAPE 3→6 : Pipeline Groq complet ──
                await analyserNoticeAvecGroq(port, text);

            } else if (file.type.startsWith('image/')) {
                // ── Image : OCR d'abord, puis Groq ──
                const canvas = await imageFileToCanvas(file);
                await lancerOCR(canvas, port);

            } else {
                if (typeof showToast === 'function') showToast('⚠️ Format non supporté. Utilisez image ou texte.');
            }

        } catch (error) {
            console.error('Upload error:', error);
            if (noticeDiv) noticeDiv.innerHTML = `❌ Erreur : ${error.message}`;
        }
    };

    input.click();
}

// -----------------------------------------------
// ÉTAPE 2 : OCR (Tesseract) sur un canvas
// Lance automatiquement le pipeline Groq après
// -----------------------------------------------
async function lancerOCR(canvas, port) {
    const noticeDiv = document.getElementById(`noticeResult${port}`);
    if (noticeDiv) {
        noticeDiv.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> OCR en cours (lecture du texte)...';
        noticeDiv.style.background = '#f0f9ff';
    }
    if (typeof showToast === 'function') showToast('🔍 OCR en cours...');

    try {
        // Reconnaissance FR + AR
        const { data: { text } } = await Tesseract.recognize(canvas, 'fra+ara', {
            logger: m => console.log('[Tesseract]', m)
        });

        const cleanText = sanitizeText(text);

        if (!cleanText || cleanText.length < 10) {
            if (noticeDiv) {
                noticeDiv.innerHTML = '⚠️ Aucun texte détecté. Essayez avec une meilleure lumière ou un upload.';
                noticeDiv.style.background = '#fee2e2';
            }
            if (typeof showToast === 'function') showToast('⚠️ Texte non détecté. Réessayez.');
            return;
        }

        if (typeof showToast === 'function')
            showToast(`✅ Texte extrait (${cleanText.length} car.). Analyse IA...`);

        // ── ÉTAPE 3→6 : Pipeline Groq complet ──
        await analyserNoticeAvecGroq(port, cleanText);

    } catch (error) {
        console.error('OCR Error:', error);
        if (noticeDiv) noticeDiv.innerHTML = '❌ Erreur OCR. Utilisez "Upload" comme alternative.';
        if (typeof showToast === 'function') showToast('❌ Erreur OCR');
    }
}

// -----------------------------------------------
// HELPER : Charger une image dans un canvas
// -----------------------------------------------
function imageFileToCanvas(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width  = img.width;
                canvas.height = img.height;
                canvas.getContext('2d').drawImage(img, 0, 0);
                resolve(canvas);
            };
            img.onerror = reject;
            img.src = event.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// -----------------------------------------------
// HELPER : Nettoyer le texte OCR
// -----------------------------------------------
function sanitizeText(text) {
    if (!text) return '';
    return text
        .replace(/[^\w\s\u00C0-\u024F\u0600-\u06FF.,;:!?()\-/°%]/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

// -----------------------------------------------
// EVENTS : Attacher les boutons scanner/upload/ia
// -----------------------------------------------
function attachScanEvents(port) {
    // Bouton Scanner
    const scanBtn = document.getElementById(`scanNotice${port}`);
    if (scanBtn) {
        const newScan = scanBtn.cloneNode(true);
        scanBtn.parentNode.replaceChild(newScan, scanBtn);
        newScan.addEventListener('click', () => initScan(port).catch(console.error));
    }

    // Bouton Upload
    const uploadBtn = document.getElementById(`uploadNotice${port}`);
    if (uploadBtn) {
        const newUpload = uploadBtn.cloneNode(true);
        uploadBtn.parentNode.replaceChild(newUpload, uploadBtn);
        newUpload.addEventListener('click', () => uploadNotice(port));
    }

    // Bouton "IA Extraire" (déclenche Groq sur le texte déjà stocké)
    const iaBtn = document.getElementById(`iaExtract${port}`);
    if (iaBtn) {
        const newIa = iaBtn.cloneNode(true);
        iaBtn.parentNode.replaceChild(newIa, iaBtn);
        newIa.addEventListener('click', async () => {
            const texte = portConfig[port]?.noticeText || '';
            if (!texte) {
                if (typeof showToast === 'function')
                    showToast(`❌ Port ${port} : scannez ou uploadez une notice d'abord`);
                return;
            }
            await analyserNoticeAvecGroq(port, texte);
        });
    }
}

// Exports globaux
window.initScan        = initScan;
window.uploadNotice    = uploadNotice;
window.lancerOCR       = lancerOCR;
window.attachScanEvents = attachScanEvents;
window.sanitizeText    = sanitizeText;