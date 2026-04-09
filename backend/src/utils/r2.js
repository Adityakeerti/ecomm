const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const r2 = new S3Client({
  region: 'auto',
  endpoint: 'https://' + process.env.R2_ACCOUNT_ID + '.r2.cloudflarestorage.com',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY,
    secretAccessKey: process.env.R2_SECRET_KEY,
  },
});

/**
 * Upload an image buffer to Cloudflare R2
 * @param {Buffer} buffer - The file buffer
 * @param {string} filename - The object key / filename in the bucket
 * @param {string} mimeType - MIME type (e.g. 'image/jpeg')
 * @returns {string} The public URL of the uploaded image
 */
exports.uploadImage = async (buffer, filename, mimeType) => {
  await r2.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: filename,
    Body: buffer,
    ContentType: mimeType,
  }));

  // Return the public URL (configured via R2 public bucket or custom domain)
  const publicUrl = process.env.R2_PUBLIC_URL || 'https://pub-xxx.r2.dev';
  return publicUrl.replace(/\/$/, '') + '/' + filename;
};
