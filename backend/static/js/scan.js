// ============================================
// KINALERT - SCAN (Caméra + OCR)
// ============================================

let currentStream = null;

async function initScan(port) {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        currentStream = stream;
        
        const video = document.createElement('video');
        video.srcObject = stream;
        video.setAttribute('playsinline', '');
        video.style.cssText = 'position:fixed; top:0; left:0; width:100%; z-index:10000; background:#000;';
        
        const canvas = document.createElement('canvas');
        const captureBtn = document.createElement('button');
        captureBtn.innerHTML = '📷 PRENDRE PHOTO';
        captureBtn.style.cssText = 'position:fixed; bottom:30px; left:50%; transform:translateX(-50%); z-index:10001; padding:14px 28px; background:#1e6f3f; color:white; border:none; border-radius:40px; font-weight:bold; cursor:pointer;';
        
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '❌ ANNULER';
        closeBtn.style.cssText = 'position:fixed; top:20px; right:20px; z-index:10001; padding:10px 20px; background:#e74c3c; color:white; border:none; border-radius:40px; cursor:pointer;';
        
        document.body.appendChild(video);
        document.body.appendChild(captureBtn);
        document.body.appendChild(closeBtn);
        
        video.play();
        
        captureBtn.onclick = async () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext('2d').drawImage(video, 0, 0);
            
            if (currentStream) currentStream.getTracks().forEach(t => t.stop());
            video.remove();
            captureBtn.remove();
            closeBtn.remove();
            
            const noticeDiv = document.getElementById(`noticeResult${port}`);
            if (noticeDiv) {
                noticeDiv.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> OCR en cours...';
            }
            
            try {
                const { data: { text } } = await Tesseract.recognize(canvas, 'fra', { logger: m => console.log(m) });
                
                if (noticeDiv) {
                    noticeDiv.innerHTML = `📄 Texte extrait (${text.length} caractères). Cliquez sur "IA Extraire".`;
                    noticeDiv.style.background = '#d1ecf1';
                }
                
                window.currentNoticeText = window.currentNoticeText || {};
                window.currentNoticeText[port] = text;
                
            } catch (ocrError) {
                console.error('OCR error:', ocrError);
                if (noticeDiv) noticeDiv.innerHTML = '❌ Erreur OCR. Réessayez.';
            }
        };
        
        closeBtn.onclick = () => {
            if (currentStream) currentStream.getTracks().forEach(t => t.stop());
            video.remove();
            captureBtn.remove();
            closeBtn.remove();
        };
        
    } catch (error) {
        console.error('Erreur caméra:', error);
        alert('❌ Impossible d\'accéder à la caméra.');
    }
}

async function uploadNotice(port) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,text/plain';
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const noticeDiv = document.getElementById(`noticeResult${port}`);
        if (noticeDiv) noticeDiv.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Lecture du fichier...';
        
        try {
            let text = '';
            
            if (file.type === 'text/plain') {
                text = await file.text();
            } else if (file.type.startsWith('image/')) {
                const img = new Image();
                const reader = new FileReader();
                const ocrPromise = new Promise((resolve) => {
                    reader.onload = async (event) => {
                        img.src = event.target.result;
                        img.onload = async () => {
                            const canvas = document.createElement('canvas');
                            canvas.width = img.width;
                            canvas.height = img.height;
                            canvas.getContext('2d').drawImage(img, 0, 0);
                            const { data: { text: ocrText } } = await Tesseract.recognize(canvas, 'fra');
                            resolve(ocrText);
                        };
                    };
                });
                reader.readAsDataURL(file);
                text = await ocrPromise;
            } else {
                throw new Error('Format non supporté');
            }
            
            if (noticeDiv) {
                noticeDiv.innerHTML = `📄 Texte extrait (${text.length} caractères). Cliquez sur "IA Extraire".`;
                noticeDiv.style.background = '#d1ecf1';
            }
            
            window.currentNoticeText = window.currentNoticeText || {};
            window.currentNoticeText[port] = text;
            
        } catch (error) {
            console.error('Upload error:', error);
            if (noticeDiv) noticeDiv.innerHTML = `❌ Erreur: ${error.message}`;
        }
    };
    
    input.click();
}

window.initScan = initScan;
window.uploadNotice = uploadNotice;
