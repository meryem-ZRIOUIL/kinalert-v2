// ============================================
// KINALERT - BLUETOOTH (Web Bluetooth API)
// ============================================

let bluetoothDevice = null;
let bluetoothCharacteristic = null;
let bluetoothConnected = false;

const BLE_SERVICE_UUID = "0000ffe0-0000-1000-8000-00805f9b34fb";
const BLE_CHAR_UUID = "0000ffe1-0000-1000-8000-00805f9b34fb";

async function connectBluetooth() {
    if (!navigator.bluetooth) {
        alert('❌ Web Bluetooth non supporté. Utilisez Chrome sur Android.');
        return;
    }
    
    try {
        const device = await navigator.bluetooth.requestDevice({
            filters: [{ namePrefix: 'Kinalert' }, { namePrefix: 'ESP32' }],
            optionalServices: [BLE_SERVICE_UUID]
        });
        
        bluetoothDevice = device;
        const server = await device.gatt.connect();
        const service = await server.getPrimaryService(BLE_SERVICE_UUID);
        bluetoothCharacteristic = await service.getCharacteristic(BLE_CHAR_UUID);
        bluetoothConnected = true;
        
        const led = document.getElementById('ledStatus');
        const text = document.getElementById('btStatusText');
        if (led) led.className = 'led connected';
        if (text) text.innerHTML = '✅ Connecté';
        
        device.addEventListener('gattserverdisconnected', () => {
            bluetoothConnected = false;
            if (led) led.className = 'led';
            if (text) text.innerHTML = 'Déconnecté';
        });
        
        alert('🔵 Boîtier connecté avec succès !');
        
    } catch (error) {
        console.error('Bluetooth error:', error);
        alert(`❌ Erreur Bluetooth: ${error.message}`);
    }
}

function disconnectBluetooth() {
    if (bluetoothDevice && bluetoothDevice.gatt.connected) {
        bluetoothDevice.gatt.disconnect();
    }
    bluetoothConnected = false;
    const led = document.getElementById('ledStatus');
    const text = document.getElementById('btStatusText');
    if (led) led.className = 'led';
    if (text) text.innerHTML = 'Déconnecté';
}

window.connectBluetooth = connectBluetooth;
window.disconnectBluetooth = disconnectBluetooth;
window.bluetoothConnected = false;
