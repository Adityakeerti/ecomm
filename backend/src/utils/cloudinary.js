const cloudinary = require('cloudinary').v2;

const hasCloudinaryConfig = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

if (hasCloudinaryConfig) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

exports.isCloudinaryConfigured = hasCloudinaryConfig;

exports.uploadImageToCloudinary = async (buffer, filename, mimeType) => {
  if (!hasCloudinaryConfig) {
    throw new Error('Cloudinary is not configured');
  }

  const base64 = buffer.toString('base64');
  const dataUri = `data:${mimeType};base64,${base64}`;
  const publicId = filename.replace(/\.[^/.]+$/, '');

  const result = await cloudinary.uploader.upload(dataUri, {
    public_id: publicId,
    folder: undefined,
    resource_type: 'image',
    overwrite: true,
  });

  return result.secure_url;
};
