// ============================================
// KINALERT - BLUETOOTH (Web Bluetooth API)
// Mode TEST : téléphone = boîtier simulé
// ============================================

let bluetoothDevice        = null;
let bluetoothCharacteristic = null;
let bluetoothConnected     = false;

// UUID standard HM-10 / modules BLE génériques
// → votre appli Android (ex: nRF Connect, Serial Bluetooth Terminal)
// doit s'abonner à cette caractéristique pour recevoir les données
const BLE_SERVICE_UUID = "0000ffe0-0000-1000-8000-00805f9b34fb";
const BLE_CHAR_UUID    = "0000ffe1-0000-1000-8000-00805f9b34fb";

// Taille max d'un paquet BLE (MTU standard = 20 octets, négociable jusqu'à 512)
const BLE_CHUNK_SIZE = 180;

// -----------------------------------------------
// CONNEXION — déclenché par "Connecter le boîtier"
// -----------------------------------------------
async function connectBluetooth() {
    if (!navigator.bluetooth) {
        showBtToast('❌ Web Bluetooth non supporté. Utilisez Chrome sur Android/Desktop.', 'error');
        return;
    }

    updateBtUI('connecting');

    try {
        // ── Recherche du périphérique ──
        // En mode TEST : votre téléphone doit émettre un signal BLE
        // via une appli comme "BLE Peripheral Simulator" (Android/iOS)
        // ou "nRF Connect" en mode serveur GATT.
        const device = await navigator.bluetooth.requestDevice({
            // Accepte n'importe quel appareil BLE visible (mode test permissif)
            acceptAllDevices: true,
            optionalServices: [BLE_SERVICE_UUID]
        });

        bluetoothDevice = device;
        showBtToast(`📡 Appareil trouvé : ${device.name || 'Inconnu'}. Connexion…`, 'info');

        const server  = await device.gatt.connect();
        let service, characteristic;

        try {
            service        = await server.getPrimaryService(BLE_SERVICE_UUID);
            characteristic = await service.getCharacteristic(BLE_CHAR_UUID);
        } catch {
            // Le service FFE0 n'est pas exposé par l'appli de test →
            // on reste connecté mais on signale la limite
            showBtToast('⚠️ Service BLE non trouvé sur cet appareil. Connexion partielle.', 'warn');
            bluetoothConnected = true;
            updateBtUI('connected', device.name || 'Appareil BLE');
            attachDisconnectListener(device);
            return;
        }

        bluetoothCharacteristic = characteristic;
        bluetoothConnected      = true;

        updateBtUI('connected', device.name || 'Appareil BLE');
        attachDisconnectListener(device);
        showBtToast(`🔵 ${device.name || 'Boîtier'} connecté avec succès !`, 'success');

    } catch (error) {
        bluetoothConnected = false;
        updateBtUI('disconnected');

        if (error.name === 'NotFoundError') {
            showBtToast('🔍 Aucun appareil sélectionné.', 'warn');
        } else if (error.name === 'SecurityError') {
            showBtToast('🔒 Permission Bluetooth refusée.', 'error');
        } else {
            showBtToast(`❌ Erreur Bluetooth : ${error.message}`, 'error');
        }
        console.error('[KinAlert BLE] Erreur connexion :', error);
    }
}

// -----------------------------------------------
// DÉCONNEXION
// -----------------------------------------------
function disconnectBluetooth() {
    if (bluetoothDevice?.gatt?.connected) {
        bluetoothDevice.gatt.disconnect();
    }
    bluetoothConnected      = false;
    bluetoothCharacteristic = null;
    bluetoothDevice         = null;
    updateBtUI('disconnected');
    showBtToast('🔌 Déconnecté du boîtier.', 'info');
}

function attachDisconnectListener(device) {
    device.addEventListener('gattserverdisconnected', () => {
        bluetoothConnected      = false;
        bluetoothCharacteristic = null;
        updateBtUI('disconnected');
        showBtToast('⚠️ Boîtier déconnecté.', 'warn');
    });
}

// -----------------------------------------------
// ENVOI JSON → BLE (découpage en chunks)
// Appelé automatiquement depuis savePort()
// -----------------------------------------------
async function envoyerBluetooth(port) {
    if (!bluetoothConnected) {
        console.info('[KinAlert BLE] Non connecté, envoi BLE ignoré.');
        return false;
    }

    if (!bluetoothCharacteristic) {
        showBtToast(`⚠️ Port ${port} sauvegardé. BLE partiel : service non disponible sur cet appareil.`, 'warn');
        return false;
    }

    // ── Construire le JSON à transmettre ──
    const pc  = window.portConfig;
    const cfg = pc?.[port];
    if (!cfg) return false;

    const payload = {
        kinalert: true,
        port,
        timestamp:   new Date().toISOString(),
        medicament:  cfg.medicament  || '',
        horaires:    cfg.horaires    || [],
        dose:        cfg.dose        || '',
        notes:       cfg.notes       || '',
        // Résumé notice si disponible, sinon config minimale
        notice: cfg.noticeJSON ? {
            nom:              cfg.noticeJSON.medicament?.nom_commercial || cfg.noticeJSON.medicament?.nom || '',
            forme:            cfg.noticeJSON.medicament?.forme  || '',
            dosage:           cfg.noticeJSON.medicament?.dosage || '',
            frequence_par_jour: cfg.noticeJSON.horaires?.frequence_par_jour || 0,
            avant_repas:      cfg.noticeJSON.utilisation?.avant_repas ?? false,
            apres_repas:      cfg.noticeJSON.utilisation?.apres_repas ?? false,
            avec_eau:         cfg.noticeJSON.utilisation?.avec_eau    ?? true,
            alertes:          cfg.noticeJSON.alertes_importantes || [],
            resume:           cfg.noticeJSON.resume_simple || ''
        } : null
    };

    const jsonStr = JSON.stringify(payload);
    const encoder = new TextEncoder();
    const bytes   = encoder.encode(jsonStr);

    showBtToast(`📤 Envoi BLE Port ${port} (${bytes.length} octets)…`, 'info');

    try {
        // ── Envoi chunk par chunk ──
        for (let i = 0; i < bytes.length; i += BLE_CHUNK_SIZE) {
            const chunk = bytes.slice(i, i + BLE_CHUNK_SIZE);
            await bluetoothCharacteristic.writeValueWithoutResponse(chunk);
            // Petite pause entre les paquets pour ne pas saturer le buffer
            await sleep(30);
        }

        // ── Marqueur de fin de trame ──
        const eof = encoder.encode('\n<<EOF>>\n');
        await bluetoothCharacteristic.writeValueWithoutResponse(eof);

        showBtToast(`✅ Port ${port} transmis au boîtier via Bluetooth !`, 'success');
        console.info(`[KinAlert BLE] Port ${port} envoyé (${bytes.length} octets en ${Math.ceil(bytes.length / BLE_CHUNK_SIZE)} paquets)`);
        return true;

    } catch (error) {
        console.error('[KinAlert BLE] Erreur envoi :', error);
        showBtToast(`❌ Échec envoi BLE : ${error.message}`, 'error');
        return false;
    }
}

// -----------------------------------------------
// MODE TEST — Réception sur téléphone
// -----------------------------------------------
// Pour recevoir les données sur votre téléphone, installez une de ces applis :
//
//  Android :
//    • "Serial Bluetooth Terminal" (Kai Morich) — abonnez-vous à FFE1
//    • "nRF Connect" → Connecter en tant que client GATT → scanner FFE0/FFE1
//    • "BLE Scanner" (Bluepixel)
//
//  iOS :
//    • "LightBlue" (Punch Through)
//    • "nRF Connect" (Nordic)
//
// Votre téléphone doit être en mode GATT Server exposant le service FFE0.
// Si ce n'est pas possible, utilisez "nRF Connect" en mode client pour
// lire les notifications depuis la machine qui exécute Chrome.
//
// ── Alternative simple (même réseau local) ──
// Si les deux appareils sont sur le même WiFi, vous pouvez simuler
// la réception en ouvrant la console du téléphone via Chrome Remote Debugging.

// -----------------------------------------------
// HELPERS
// -----------------------------------------------
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function updateBtUI(state, deviceName) {
    const led  = document.getElementById('ledStatus');
    const text = document.getElementById('btStatusText');
    const btn  = document.getElementById('connectBtn');

    switch (state) {
        case 'connecting':
            if (led)  { led.className = 'led'; led.style.background = '#f59e0b'; }
            if (text) text.innerHTML = '🔄 Connexion…';
            if (btn)  btn.disabled = true;
            break;

        case 'connected':
            if (led)  { led.className = 'led connected'; led.style.background = ''; }
            if (text) text.innerHTML = `✅ ${deviceName || 'Connecté'}`;
            if (btn)  { btn.disabled = false; btn.textContent = '🔌 Déconnecter'; btn.onclick = disconnectBluetooth; }
            break;

        case 'disconnected':
        default:
            if (led)  { led.className = 'led'; led.style.background = 'gray'; }
            if (text) text.innerHTML = 'Déconnecté';
            if (btn)  { btn.disabled = false; btn.textContent = '📱 Connecter le boîtier'; btn.onclick = connectBluetooth; }
            break;
    }
}

function showBtToast(msg, type = 'info') {
    // Utilise showToast() si disponible dans le projet, sinon console
    if (typeof showToast === 'function') {
        showToast(msg);
        return;
    }

    // Toast minimaliste intégré
    const colors = {
        success: '#1e6f3f',
        error:   '#dc2626',
        warn:    '#92400e',
        info:    '#0f3b5c'
    };

    const toast = document.createElement('div');
    toast.style.cssText = `
        position:fixed; bottom:24px; left:50%; transform:translateX(-50%);
        background:${colors[type] || colors.info}; color:white;
        padding:12px 24px; border-radius:40px; font-size:13px; font-weight:600;
        z-index:99999; box-shadow:0 4px 12px rgba(0,0,0,0.25);
        animation:fadeInUp .25s ease;`;
    toast.textContent = msg;

    if (!document.getElementById('kinalert-toast-style')) {
        const style = document.createElement('style');
        style.id = 'kinalert-toast-style';
        style.textContent = `
            @keyframes fadeInUp {
                from { opacity:0; transform:translate(-50%, 12px); }
                to   { opacity:1; transform:translate(-50%, 0); }
            }`;
        document.head.appendChild(style);
    }

    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}

// -----------------------------------------------
// Bouton "Connecter le boîtier" → connectBluetooth
// (remplace le simple toggle LED du template HTML)
// -----------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('connectBtn');
    if (btn) {
        btn.onclick = connectBluetooth;
    }
    updateBtUI('disconnected');
});

// -----------------------------------------------
// Exports globaux
// -----------------------------------------------
window.connectBluetooth    = connectBluetooth;
window.disconnectBluetooth = disconnectBluetooth;
window.envoyerBluetooth    = envoyerBluetooth;
window.bluetoothConnected  = bluetoothConnected;