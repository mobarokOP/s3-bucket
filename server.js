const express = require('express');
const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3000;

// Path to the JSON file for persistent storage
const bucketsFilePath = path.join(__dirname, 'buckets.json');

// Load buckets from file or initialize empty array if file doesn’t exist
let buckets = [];
try {
  if (fs.existsSync(bucketsFilePath)) {
    const fileData = fs.readFileSync(bucketsFilePath, 'utf8');
    buckets = JSON.parse(fileData);
  } else {
    buckets = [];
    fs.writeFileSync(bucketsFilePath, JSON.stringify(buckets, null, 2), 'utf8');
  }
} catch (err) {
  console.error('Error loading buckets from file:', err);
}

// AWS S3 setup with v3 SDK
const s3Client = new S3Client({
  endpoint: process.env.R2_ENDPOINT || 'https://c731cdfdb6f8fc3382a939acdedf3692.r2.cloudflarestorage.com',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '33a8537238bb4598707729e04216d880',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || 'b0cb22f05f320afd7f28ad5d6a7d33463a1cc7a043a41880b652495358fa2222',
  },
  region: 'auto',
});

// Common CSS for all pages
const cssStyles = `
  body {
    font-family: Arial, sans-serif;
    margin: 0;
    padding: 20px;
    background-color: #f4f4f9;
    color: #333;
  }
  h2, h3 {
    color: #2c3e50;
  }
  a {
    color: #3498db;
    text-decoration: none;
  }
  a:hover {
    text-decoration: underline;
  }
  .container {
    max-width: 800px;
    margin: 0 auto;
  }
  ul {
    list-style: none;
    padding: 0;
  }
  ul li {
    background: #fff;
    margin: 10px 0;
    padding: 15px;
    border-radius: 5px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }
  ul li a {
    font-size: 1.1em;
  }
  form {
    background: #fff;
    padding: 20px;
    border-radius: 5px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    margin-top: 20px;
  }
  form label {
    display: block;
    margin-bottom: 5px;
    font-weight: bold;
  }
  form input[type="text"] {
    width: 100%;
    padding: 8px;
    margin-bottom: 10px;
    border: 1px solid #ddd;
    border-radius: 4px;
    box-sizing: border-box;
  }
  form button {
    background-color: #3498db;
    color: white;
    padding: 10px 15px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }
  form button:hover {
    background-color: #2980b9;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    background: #fff;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    margin-top: 20px;
  }
  th, td {
    padding: 12px;
    text-align: left;
    border-bottom: 1px solid #ddd;
  }
  th {
    background-color: #3498db;
    color: white;
  }
  tr:hover {
    background-color: #f1f1f1;
  }
  td button {
    background-color: #2ecc71;
    color: white;
    border: none;
    padding: 8px 12px;
    border-radius: 4px;
    cursor: pointer;
  }
  td button:hover {
    background-color: #27ae60;
  }
  td a.download-link {
    background-color: #e74c3c;
    color: white;
    padding: 8px 12px;
    border-radius: 4px;
    display: inline-block;
  }
  td a.download-link:hover {
    background-color: #c0392b;
    text-decoration: none;
  }
  @media (max-width: 600px) {
    table, th, td {
      font-size: 0.9em;
    }
    form input[type="text"] {
      width: 100%;
    }
  }
`;

app.get('/', async (req, res) => {
  // Validate bucket existence in R2
  const validBuckets = [];
  for (const bucket of buckets) {
    try {
      const command = new ListObjectsV2Command({ Bucket: bucket.name });
      await s3Client.send(command);
      validBuckets.push(bucket);
    } catch (err) {
      console.error(`Bucket ${bucket.name} no longer exists:`, err);
      // Skip buckets that don't exist (e.g., deleted in R2)
    }
  }

  // Update buckets array and file if any were removed
  if (validBuckets.length !== buckets.length) {
    buckets = validBuckets;
    try {
      fs.writeFileSync(bucketsFilePath, JSON.stringify(buckets, null, 2), 'utf8');
      console.log('Updated buckets.json with valid buckets');
    } catch (err) {
      console.error('Error saving updated buckets to file:', err);
    }
  }

  const bucketListHtml = buckets.map(bucket => `
    <li>
      <a href="/bucket/${encodeURIComponent(bucket.name)}">${bucket.name}</a>
    </li>
  `).join('');

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Bucket List</title>
      <style>${cssStyles}</style>
    </head>
    <body>
      <div class="container">
        <h2>Available Buckets</h2>
        <ul>
          ${bucketListHtml}
        </ul>
        <form action="/add-bucket" method="POST">
          <h3>Add New Bucket</h3>
          <label for="name">Name:</label><br>
          <input type="text" name="name" required /><br><br>
          <label for="publicUrl">Public URL:</label><br>
          <input type="text" name="publicUrl" required /><br><br>
          <button type="submit">Add Bucket</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

app.use(express.urlencoded({ extended: true })); // Middleware to parse URL-encoded data

app.post('/add-bucket', (req, res) => {
  const { name, publicUrl } = req.body;

  // Validate input
  if (!name || !publicUrl) {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Error</title>
        <style>${cssStyles}</style>
      </head>
      <body>
        <div class="container">
          <h3>Error</h3>
          <p>Both bucket name and URL are required!</p>
          <p><a href="/">Go back to the home page</a></p>
        </div>
      </body>
      </html>
    `);
  }

  // Add new bucket to the array
  buckets.push({ name, publicUrl });

  // Save updated buckets to file
  try {
    fs.writeFileSync(bucketsFilePath, JSON.stringify(buckets, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving buckets to file:', err);
    return res.status(500).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Error</title>
        <style>${cssStyles}</style>
      </head>
      <body>
        <div class="container">
          <h3>Error saving bucket</h3>
          <p>Failed to save the new bucket. Please try again.</p>
          <p><a href="/">Go back to the home page</a></p>
        </div>
      </body>
      </html>
    `);
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Success</title>
      <style>${cssStyles}</style>
    </head>
    <body>
      <div class="container">
        <h3>Bucket added successfully!</h3>
        <p><a href="/">Go back to the home page</a></p>
      </div>
    </body>
    </html>
  `);
});

app.get('/bucket/:bucketName', async (req, res) => {
  const bucketName = req.params.bucketName;
  const bucketConfig = buckets.find(b => b.name === bucketName);

  if (!bucketConfig) {
    return res.status(404).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Bucket Not Found</title>
        <style>${cssStyles}</style>
      </head>
      <body>
        <div class="container">
          <h3>Bucket not found!</h3>
          <p><a href="/">Go back to the home page</a></p>
        </div>
      </body>
      </html>
    `);
  }

  const params = { Bucket: bucketName };

  let files = [];
  try {
    const command = new ListObjectsV2Command(params);
    const data = await s3Client.send(command);
    files = (data.Contents || []).map(file => ({
      key: file.Key,
      url: `${bucketConfig.publicUrl}/${file.Key}`,
    }));
  } catch (err) {
    console.error('Error listing files:', err);
  }

  const fileListHtml = files.map(file => `
    <tr>
      <td><a href="${file.url}" target="_blank">${file.key}</a></td>
      <td><button onclick="copyToClipboard('${file.url}')">Copy Link</button></td>
      <td><a href="/download/${encodeURIComponent(bucketName)}/${encodeURIComponent(file.key)}" class="download-link">Download</a></td>
    </tr>
  `).join('');

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Bucket Files - ${bucketName}</title>
      <style>${cssStyles}</style>
    </head>
    <body>
      <div class="container">
        <h2>Bucket Files - ${bucketName}</h2>
        <table>
          <thead>
            <tr>
              <th>File Name</th>
              <th>Copy URL</th>
              <th>Download</th>
            </tr>
          </thead>
          <tbody>
            ${fileListHtml}
          </tbody>
        </table>
        <script>
          function copyToClipboard(text) {
            navigator.clipboard.writeText(text)
              .then(() => {
                alert('Link copied to clipboard!');
              })
              .catch(err => {
                alert('Failed to copy!');
              });
          }
        </script>
      </div>
    </body>
    </html>
  `);
});

app.get('/download/:bucketName/:key', async (req, res) => {
  const bucketName = req.params.bucketName;
  const fileKey = decodeURIComponent(req.params.key);

  const params = {
    Bucket: bucketName,
    Key: fileKey,
  };

  try {
    const command = new GetObjectCommand(params);
    const data = await s3Client.send(command);
    const fileStream = data.Body;

    res.setHeader('Content-Disposition', `attachment; filename="${fileKey}"`);
    res.setHeader('Content-Type', 'application/octet-stream');

    fileStream.pipe(res);
  } catch (err) {
    console.error('Error downloading file:', err);
    return res.status(500).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Error</title>
        <style>${cssStyles}</style>
      </head>
      <body>
        <div class="container">
          <h3>Error downloading file</h3>
          <p><a href="/">Go back to the home page</a></p>
        </div>
      </body>
      </html>
    `);
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});