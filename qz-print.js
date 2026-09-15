// ================================================================
// qz-print.js - QZ Tray printer moduli
// ================================================================

let qzConnected = false;
let qzConnecting = false;

// QZ Tray'ga ulanish
async function connectQZTray(silent = false) {
    if (qzConnected && window.qz && qz.websocket.isActive()) return true;
    if (qzConnecting) {
        return new Promise(resolve => {
            const iv = setInterval(() => {
                if (!qzConnecting) { clearInterval(iv); resolve(qzConnected); }
            }, 200);
        });
    }
    qzConnecting = true;
    if (typeof qz === 'undefined' || !window.qz) {
        qzConnected = false; qzConnecting = false;
        if (!silent) console.error('QZ Tray kutubxonasi yuklanmagan');
        return false;
    }
    try {
        qz.security.setCertificatePromise(function(resolve) { resolve(); });
        qz.security.setSignatureAlgorithm("SHA512");
        qz.security.setSignaturePromise(function() {
            return function(resolve) { resolve(); };
        });
        if (qz.websocket.isActive()) {
            qzConnected = true; qzConnecting = false; return true;
        }
        await qz.websocket.connect({ retries: 3, delay: 1, usingSecure: false });
        qzConnected = true; qzConnecting = false;
        if (!silent) console.log('✅ QZ Tray ulandi');
        qz.websocket.setClosedCallbacks(function() {
            qzConnected = false;
            console.warn('⚠️ QZ Tray uzildi');
        });
        return true;
    } catch (err) {
        qzConnected = false; qzConnecting = false;
        if (!silent) console.error('QZ Tray xatosi:', err);
        return false;
    }
}

// Printerlarni topish
async function findPrinters() {
    const ok = await connectQZTray();
    if (!ok) return [];
    try {
        return await qz.printers.find();
    } catch (e) {
        console.error('Printer qidirishda xato:', e);
        return [];
    }
}

// ================================================================
// CHEK CHIQARISH (ESC/POS)
// ================================================================
async function printReceiptQZ(printerName, sale, cashierName) {
    const ok = await connectQZTray();
    if (!ok) throw new Error('QZ Tray ulanmagan');
    if (!printerName) throw new Error('Chek printeri tanlanmagan');
    
    const ESC = '\x1B', GS = '\x1D';
    const INIT = ESC + '@';
    const ALIGN_CENTER = ESC + 'a' + '\x01';
    const ALIGN_LEFT = ESC + 'a' + '\x00';
    const BOLD_ON = ESC + 'E' + '\x01';
    const BOLD_OFF = ESC + 'E' + '\x00';
    const DOUBLE_ON = GS + '!' + '\x11';
    const DOUBLE_OFF = GS + '!' + '\x00';
    const CUT = GS + 'V' + '\x00';
    const FEED = (n) => ESC + 'd' + String.fromCharCode(n);
    
    const fmt = (n) => (n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const now = new Date();
    
    let data = INIT + ALIGN_CENTER + BOLD_ON + DOUBLE_ON + 'BILAL-SALE' + '\n' + DOUBLE_OFF + BOLD_OFF;
    data += now.toLocaleDateString('uz') + ' ' + now.toLocaleTimeString('uz') + '\n';
    if (cashierName) data += 'Kassir: ' + cashierName + '\n';
    data += '--------------------------------\n';
    data += ALIGN_LEFT;
    
    sale.items.forEach(item => {
        const itemTotal = item.sell * item.qty;
        data += item.name + '\n';
        data += `  ${item.qty} x ${fmt(item.sell)}` + ' '.repeat(Math.max(1, 18 - item.name.length)) + fmt(itemTotal) + '\n';
    });
    data += '--------------------------------\n';
    if (sale.discount && sale.discount > 0) {
        data += `Chegirma: ${sale.discount}%\n`;
        data += `Asl narx: ${fmt(sale.originalTotal)} so'm\n`;
    }
    data += BOLD_ON + `JAMI: ${fmt(sale.total)} so'm` + BOLD_OFF + '\n';
    data += '--------------------------------\n';
    if (sale.payments) {
        if (sale.payments.naxt > 0) data += `Naxt: ${fmt(sale.payments.naxt)} so'm\n`;
        if (sale.payments.uzcard > 0) data += `Uzcard: ${fmt(sale.payments.uzcard)} so'm\n`;
        if (sale.payments.humo > 0) data += `Humo: ${fmt(sale.payments.humo)} so'm\n`;
        if (sale.payments.click > 0) data += `Click: ${fmt(sale.payments.click)} so'm\n`;
        if (sale.payments.nasiya > 0) data += `Nasiya: ${fmt(sale.payments.nasiya)} so'm\n`;
    }
    if (sale.debtor) {
        data += '--------------------------------\n';
        data += `Qarzdor: ${sale.debtor.name} ${sale.debtor.surname}\n`;
        data += `Tel: ${sale.debtor.phone}\n`;
        data += `Qaytarish: ${new Date(sale.debtor.date).toLocaleDateString('uz')}\n`;
    }
    data += ALIGN_CENTER + '\n';
    data += BOLD_ON + 'Xaridingiz uchun rahmat!\n' + BOLD_OFF;
    data += 'Bilal-sale\n';
    data += FEED(4) + CUT;
    
    const config = qz.configs.create(printerName);
    await qz.print(config, [{ type: 'raw', format: 'plain', data: data }]);
    return true;
}

// ================================================================
// ETIKETKA CHIQARISH - 40x30 mm (rasm sifatida)
// Ko'rinish:
//        NON
//    5 000 SO'M
//  ||||||||||||||||||
//    13.09.2026
// ================================================================
async function printLabelQZ(printerName, product) {
    const ok = await connectQZTray();
    if (!ok) throw new Error('QZ Tray ulanmagan');
    if (!printerName) throw new Error('Etiketka printeri tanlanmagan');
    
    const name = (product.name || '').toUpperCase();
    const price = product.sell || 0;
    const barcode = product.barcode || '';
    const fmt = (n) => (n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    
    // Bugungi sana (DD.MM.YYYY)
    const today = new Date();
    const dateStr = String(today.getDate()).padStart(2, '0') + '.' +
                    String(today.getMonth() + 1).padStart(2, '0') + '.' +
                    today.getFullYear();
    
    // ===== 40 x 30 mm @ 203 DPI = 320 x 240 px =====
    const DPI = 203;
    const WIDTH_PX = Math.round(40 / 25.4 * DPI);   // ≈320 px
    const HEIGHT_PX = Math.round(30 / 25.4 * DPI);  // ≈240 px
    
    // ===== Barcode SVG yaratish =====
    const barcodeSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    barcodeSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    if (barcode) {
        try {
            JsBarcode(barcodeSvg, barcode, {
                format: "CODE128",
                width: 3,
                height: 70,
                displayValue: false,
                margin: 0,
                background: "#ffffff",
                lineColor: "#000000"
            });
        } catch (e) {
            console.error('Barcode xato:', e);
        }
    }
    
    // ===== Canvas yaratish =====
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH_PX;
    canvas.height = HEIGHT_PX;
    const ctx = canvas.getContext('2d');
    
    // Oq fon
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, WIDTH_PX, HEIGHT_PX);
    
    // Qora matn, markazga
    ctx.fillStyle = '#000000';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    
    const centerX = WIDTH_PX / 2;
    const padding = 6;
    
    // ===== 1. MAHSULOT NOMI (katta, qora, qalin) =====
    ctx.font = 'bold 38px Arial, sans-serif';
    let displayName = name;
    const maxNameWidth = WIDTH_PX - padding * 2;
    // Agar juda uzun bo'lsa, kichraytirish
    let fontSize = 38;
    while (ctx.measureText(displayName).width > maxNameWidth && fontSize > 18) {
        fontSize -= 2;
        ctx.font = 'bold ' + fontSize + 'px Arial, sans-serif';
    }
    ctx.fillText(displayName, centerX, 10);
    
    // ===== 2. NARX (juda katta, qora, qalin) =====
    ctx.font = 'bold 46px Arial, sans-serif';
    const priceText = fmt(price) + " SO'M";
    let priceFontSize = 46;
    while (ctx.measureText(priceText).width > maxNameWidth && priceFontSize > 24) {
        priceFontSize -= 2;
        ctx.font = 'bold ' + priceFontSize + 'px Arial, sans-serif';
    }
    ctx.fillText(priceText, centerX, 55);
    
    // ===== 3. SHTRIX-KOD (tiniq qora) =====
    if (barcode) {
        const barcodeImg = new Image();
        const barcodeSvgString = new XMLSerializer().serializeToString(barcodeSvg);
        const svgBlob = new Blob([barcodeSvgString], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);
        
        await new Promise((resolve) => {
            barcodeImg.onload = function() {
                const bcW = WIDTH_PX - padding * 2;
                const bcH = 75;
                const bcX = padding;
                const bcY = 115;
                ctx.drawImage(barcodeImg, bcX, bcY, bcW, bcH);
                URL.revokeObjectURL(url);
                resolve();
            };
            barcodeImg.onerror = () => { URL.revokeObjectURL(url); resolve(); };
            barcodeImg.src = url;
        });
    }
    
    // ===== 4. SANA (pastda, o'rtada, katta) =====
    ctx.font = 'bold 24px Arial, sans-serif';
    ctx.fillText(dateStr, centerX, 200);
    
    // ===== 5. QZ Tray orqali printerga yuborish =====
    const base64Image = canvas.toDataURL('image/png');
    
    const config = qz.configs.create(printerName, {
        size: { width: 40, height: 30 },
        units: 'mm',
        margins: 0,
        rasterize: false
    });
    
    await qz.print(config, [
        { type: 'pixel', format: 'image', flavor: 'base64', data: base64Image }
    ]);
    return true;
}

// Avtomatik ulanish
window.addEventListener('load', () => setTimeout(() => connectQZTray(true), 1500));
setInterval(() => { if (!qzConnected) connectQZTray(true); }, 30000);

console.log('📦 qz-print.js yuklandi');