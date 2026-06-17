const express = require('express');
const mysql = require('mysql2');
const { BlobServiceClient } = require('@azure/storage-blob');
const multer = require('multer');
const path = require('path');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// --- ROUTE UTAMA ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- KONFIGURASI DATABASE (MENGGUNAKAN POOL AGAR TIDAK DISCONNECT) ---
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: { rejectUnauthorized: false }
});

// Koneksi Blob Storage
const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);

// Endpoint untuk submit tugas
app.post('/submit-task', upload.single('file_tugas'), async (req, res) => {
    try {
        const { nim, name, class_name, course } = req.body;
        
        if (!req.file) return res.status(400).send("Pilih file terlebih dahulu.");

        const blobName = `${nim}_${Date.now()}_${req.file.originalname}`;

        // 1. Upload ke Blob Storage
        const containerClient = blobServiceClient.getContainerClient('tugas-praktikum');
        await containerClient.createIfNotExists({ access: 'blob' });

        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        await blockBlobClient.uploadData(req.file.buffer);
        const fileUrl = blockBlobClient.url;

        // 2. Simpan ke MySQL menggunakan pool.query
        const sql = "INSERT INTO submissions (nim, name, class, course, file_url) VALUES (?, ?, ?, ?, ?)";
        pool.query(sql, [nim, name, class_name, course, fileUrl], (err) => {
            if (err) {
                console.error('MySQL Error:', err);
                return res.status(500).send("Gagal simpan ke database: " + err.message);
            }
            res.send(`
                <!DOCTYPE html>
                <html lang="id">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Berhasil | Praktikum Submit</title>
                    <style>
                        body {
                            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                            background-color: #fce4ec;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            min-height: 100vh;
                            margin: 0;
                        }
                        .container {
                            background-color: white;
                            padding: 2.5rem;
                            border-radius: 20px;
                            box-shadow: 0 10px 25px rgba(240, 98, 146, 0.2);
                            width: 100%;
                            max-width: 400px;
                            text-align: center;
                        }
                        .icon {
                            font-size: 50px;
                            color: #ff85a2;
                            margin-bottom: 15px;
                        }
                        h2 {
                            color: #f06292;
                            margin-bottom: 10px;
                        }
                        p {
                            color: #333;
                            line-height: 1.5;
                            margin-bottom: 25px;
                        }
                        .btn-back {
                            display: inline-block;
                            width: 100%;
                            background-color: #ff85a2;
                            color: white;
                            padding: 12px;
                            text-decoration: none;
                            border-radius: 10px;
                            font-weight: bold;
                            transition: background-color 0.3s;
                        }
                        .btn-back:hover {
                            background-color: #f06292;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="icon">🌸</div>
                        <h2>BERHASIL!</h2>
                        <p>Tugas kamu telah aman tersimpan di Azure Cloud.</p>
                        <a href="/" class="btn-back">Kirim Tugas Lain</a>
                    </div>
                </body>
                </html>
            `);
        });
    } catch (err) {
        res.status(500).send("Error Sistem: " + err.message);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
