const express = require("express");
const mysql = require("mysql2");
const { BlobServiceClient } = require("@azure/storage-blob");
const multer = require("multer");
const app = express();

const upload = multer({ storage: multer.memoryStorage() });

app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: {
    rejectUnauthorized: false
  }
});

db.connect((err) => {
  if (err) {
    console.log("Database Error :", err);
  } else {
    console.log("Database Connected");
  }
});

const blobServiceClient =
  BlobServiceClient.fromConnectionString(
    process.env.AZURE_STORAGE_CONNECTION_STRING
  );

const containerName = "tugas-praktikum";

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

app.post(
  "/submit-task",
  upload.single("file_tugas"),
  async (req, res) => {
    try {
      const { nim, name, class_name, course } = req.body;

      const blobName =
        `${nim}_${Date.now()}_${req.file.originalname}`;

      const containerClient =
        blobServiceClient.getContainerClient(
          containerName
        );

      const blockBlobClient =
        containerClient.getBlockBlobClient(blobName);

      await blockBlobClient.uploadData(
        req.file.buffer
      );

      const fileUrl = blockBlobClient.url;

      const sql = `
      INSERT INTO submissions
      (nim,name,class,course,file_url)
      VALUES (?,?,?,?,?)
      `;

      db.query(
        sql,
        [
          nim,
          name,
          class_name,
          course,
          fileUrl
        ],
        (err) => {
          if (err) {
            console.log(err);
            return res.send(
              "<h2>Gagal menyimpan data</h2>"
            );
          }

          res.send(`
            <h1>Tugas Berhasil Dikirim!</h1>
            <p>NIM : ${nim}</p>
            <p>Nama : ${name}</p>
            <a href="/">Kembali</a>
          `);
        }
      );
    } catch (error) {
      console.log(error);

      res.send(`
        <h2>Terjadi Kesalahan</h2>
      `);
    }
  }
);

app.get("/task-list", (req, res) => {
  db.query(
    "SELECT * FROM submissions",
    (err, result) => {
      if (err) {
        return res.send(err);
      }

      let html = `
      <h1>Daftar Tugas</h1>
      <table border="1" cellpadding="10">
      <tr>
      <th>NIM</th>
      <th>Nama</th>
      <th>Kelas</th>
      <th>Mata Kuliah</th>
      <th>Status</th>
      </tr>
      `;

      result.forEach((item) => {
        html += `
        <tr>
        <td>${item.nim}</td>
        <td>${item.name}</td>
        <td>${item.class}</td>
        <td>${item.course}</td>
        <td>${item.status}</td>
        </tr>
        `;
      });

      html += "</table>";

      res.send(html);
    }
  );
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(
    `Server running on port ${PORT}`
  );
});
