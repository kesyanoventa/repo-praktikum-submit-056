const express = require("express");
const mysql = require("mysql2");
const { BlobServiceClient } = require("@azure/storage-blob");
const multer = require("multer");
const path = require("path");

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// =========================
// DEBUG ENVIRONMENT
// =========================
console.log("DB_HOST =", process.env.DB_HOST);
console.log("DB_USER =", process.env.DB_USER);
console.log(
  "DB_PASSWORD =",
  process.env.DB_PASSWORD ? "ADA" : "KOSONG"
);
console.log("DB_NAME =", process.env.DB_NAME);

// =========================
// MYSQL CONNECTION
// =========================
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,

  ssl: {
    rejectUnauthorized: false,
  },
});

// Test koneksi saat startup
pool.getConnection((err, connection) => {
  if (err) {
    console.error("MYSQL CONNECTION ERROR:");
    console.error(err);
  } else {
    console.log("MYSQL CONNECTED!");
    connection.release();
  }
});

// =========================
// AZURE STORAGE
// =========================
let blobServiceClient;

try {
  blobServiceClient =
    BlobServiceClient.fromConnectionString(
      process.env.AZURE_STORAGE_CONNECTION_STRING
    );

  console.log("AZURE STORAGE CONNECTED!");
} catch (err) {
  console.error("AZURE STORAGE ERROR:");
  console.error(err);
}

// =========================
// HOME PAGE
// =========================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// =========================
// SUBMIT TASK
// =========================
app.post(
  "/submit-task",
  upload.single("file_tugas"),
  async (req, res) => {
    try {
      const {
        nim,
        name,
        class_name,
        course,
      } = req.body;

      if (!req.file) {
        return res
          .status(400)
          .send("File belum dipilih.");
      }

      console.log(
        `Upload dari ${nim} - ${name}`
      );

      // =========================
      // UPLOAD KE BLOB STORAGE
      // =========================
      const containerName =
        "tugas-praktikum";

      const containerClient =
        blobServiceClient.getContainerClient(
          containerName
        );

      await containerClient.createIfNotExists({
        access: "blob",
      });

      const blobName =
        `${nim}_${Date.now()}_${req.file.originalname}`;

      const blockBlobClient =
        containerClient.getBlockBlobClient(
          blobName
        );

      await blockBlobClient.uploadData(
        req.file.buffer
      );

      const fileUrl =
        blockBlobClient.url;

      console.log(
        "FILE BERHASIL UPLOAD:"
      );
      console.log(fileUrl);

      // =========================
      // SIMPAN KE DATABASE
      // =========================
      const sql = `
      INSERT INTO submissions
      (
        nim,
        name,
        class,
        course,
        file_url
      )
      VALUES
      (
        ?, ?, ?, ?, ?
      )
      `;

      pool.query(
        sql,
        [
          nim,
          name,
          class_name,
          course,
          fileUrl,
        ],
        (err, result) => {
          if (err) {
            console.error(
              "MYSQL INSERT ERROR:"
            );
            console.error(err);

            return res
              .status(500)
              .send(
                "Gagal simpan database: " +
                  err.message
              );
          }

          console.log(
            "DATA BERHASIL DISIMPAN!"
          );

          res.send(`
          <html>
          <head>
            <title>Berhasil</title>
          </head>

          <body
            style="
            font-family:Arial;
            text-align:center;
            margin-top:100px;
            "
          >
            <h1>🌸 Tugas Berhasil Dikirim</h1>

            <p>
              Data berhasil disimpan
              ke Azure Database
            </p>

            <a href="/">
              Kirim Lagi
            </a>
          </body>
          </html>
          `);
        }
      );
    } catch (err) {
      console.error(
        "SUBMIT ERROR:"
      );
      console.error(err);

      res
        .status(500)
        .send(
          "Terjadi Error: " +
            err.message
        );
    }
  }
);

// =========================
// LIST DATA
// =========================
app.get("/task-list", (req, res) => {
  pool.query(
    "SELECT * FROM submissions",
    (err, result) => {
      if (err) {
        return res.send(err);
      }

      res.json(result);
    }
  );
});

// =========================
// SERVER
// =========================
const PORT =
  process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(
    `Server running on port ${PORT}`
  );
});
