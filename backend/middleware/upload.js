// middleware/mediaUpload.js
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'chat_media',
    allowed_formats: ['jpg', 'png', 'jpeg', 'mp3', 'webm', 'pdf', 'doc', 'docx', 'txt'],
    resource_type: 'auto',
  },
});

const upload = multer({ storage: storage });

module.exports = upload;