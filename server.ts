import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import admin from "firebase-admin";
import fs from "fs";
import dotenv from "dotenv";
import os from "os";
import http from "http";
import QRCode from "qrcode";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load Firebase Config
const firebaseConfig = JSON.parse(fs.readFileSync("./firebase-applet-config.json", "utf-8"));

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

// Use the specific database ID if provided
const db = admin.firestore(firebaseConfig.firestoreDatabaseId);

// AUTO-DETECT LOCAL IP
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (let devName in interfaces) {
    let iface = interfaces[devName];
    if (!iface) continue;
    for (let i = 0; i < iface.length; i++) {
      let alias = iface[i];
      if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
        return alias.address;
      }
    }
  }
  return '0.0.0.0';
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;
  const HOST = '0.0.0.0';

  app.use(express.json());

  // Webhook for Airtel/MTN Money (via MacroDroid/SMS Forwarder)
  app.post("/api/webhook/airtel-money", async (req, res) => {
    console.log("Received Webhook:", req.body);
    const { sender, message } = req.body;

    if (!message) return res.status(400).json({ error: "No message" });

    // Regex to extract amount and phone number from standard MoMo SMS
    const amountMatch = message.match(/received\s+([\d,]+)\s+UGX/i);
    const phoneMatch = message.match(/from\s+(\d+)/i);

    if (amountMatch && phoneMatch) {
      const amount = amountMatch[1].replace(/,/g, '');
      const phone = phoneMatch[1].startsWith('256') ? `+${phoneMatch[1]}` : phoneMatch[1];
      
      console.log(`Processing Payment: ${amount} UGX from ${phone}`);

      try {
        const querySnapshot = await db.collection('users').where('phoneNumber', '==', phone).get();

        if (!querySnapshot.empty) {
          const userDoc = querySnapshot.docs[0];
          const userData = userDoc.data();
          const currentBalance = userData.balance || 0;
          const newBalance = currentBalance + Number(amount);

          await userDoc.ref.set({ balance: newBalance }, { merge: true });
          
          await db.collection('transactions').add({
            userId: userDoc.id,
            amount: Number(amount),
            phone,
            type: 'deposit',
            status: 'completed',
            timestamp: admin.firestore.Timestamp.now(),
            rawMessage: message
          });

          // Optional SMS Notification
          try {
            const smsSettings = await db.collection('settings').doc('sms').get();
            if (smsSettings.exists && smsSettings.data()?.enabled) {
              const { apiKey, senderId } = smsSettings.data()!;
              console.log(`[SMS Gateway] Notifying ${phone}: Received ${amount} UGX. New balance: ${newBalance} UGX.`);
              // Real integration would happen here
            }
          } catch (smsErr) {
            console.error("SMS Notification failed:", smsErr);
          }

          console.log(`Balance updated for ${phone}: ${newBalance} UGX`);
        } else {
          console.log(`User not found for phone: ${phone}`);
          await db.collection('orphaned_transactions').add({
            amount: Number(amount),
            phone,
            timestamp: admin.firestore.Timestamp.now(),
            rawMessage: message
          });
        }
      } catch (err) {
        console.error("Webhook processing error:", err);
      }
    }

    res.json({ status: "received" });
  });

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // ROUTER HEARTBEAT
  app.get('/api/status', (req, res) => {
    const check = http.get({
      host: '192.168.11.1',
      timeout: 1500
    }, (response) => {
      res.json({ online: true, message: "Hub Active in Zanta" });
    });

    check.on('error', () => {
      res.json({ online: false, message: "Hub Offline - Power Off" });
    });
  });

  // QR CODE & LINK SHARING
  app.get('/api/share', async (req, res) => {
    const ip = getLocalIP();
    const shareUrl = `http://${ip}:${PORT}/api/download`;
    
    try {
      const qrImage = await QRCode.toDataURL(shareUrl);
      res.send(`
        <div style="text-align:center; font-family:sans-serif; background:#000; color:#fff; padding:20px; min-height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center;">
          <h1 style="margin-bottom:20px;">Data Empire Sharing</h1>
          <img src="${qrImage}" style="width:250px; border:10px solid #fff; border-radius:10px; margin-bottom:20px;">
          <p style="font-size:1.2rem; margin-bottom:20px;">Scan to Download App</p>
          <div style="width:100%; max-width:400px; height:1px; background:rgba(255,255,255,0.2); margin-bottom:20px;"></div>
          <p style="margin-bottom:10px;">Direct Link:</p>
          <p style="background:rgba(255,255,255,0.1); padding:10px; border-radius:5px; word-break:break-all; margin-bottom:20px;"><strong>${shareUrl}</strong></p>
          <button onclick="navigator.clipboard.writeText('${shareUrl}').then(() => alert('Link copied!'))" style="background:#fff; color:#000; border:none; padding:10px 20px; border-radius:5px; cursor:pointer; font-weight:bold;">Copy Link</button>
        </div>
      `);
    } catch (err) {
      res.status(500).send("Error generating QR");
    }
  });

  // THE "XENDER-STYLE" DOWNLOAD
  app.get('/api/download', (req, res) => {
    const file = path.join(__dirname, 'DataEmpire.apk');
    if (fs.existsSync(file)) {
      res.download(file, 'DataEmpire.apk');
    } else {
      res.send("APK not found. Please build it first.");
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(Number(PORT), HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
  });
}

startServer();
