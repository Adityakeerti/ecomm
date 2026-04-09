const { uploadImage: uploadImageToR2 } = require('./r2');
const { uploadImageToCloudinary, isCloudinaryConfigured } = require('./cloudinary');

const provider = (process.env.IMAGE_STORAGE_PROVIDER || 'cloudinary').toLowerCase();

exports.uploadImage = async (buffer, filename, mimeType) => {
  if (provider === 'cloudinary') {
    return uploadImageToCloudinary(buffer, filename, mimeType);
  }

  if (provider === 'r2') {
    return uploadImageToR2(buffer, filename, mimeType);
  }

  if (isCloudinaryConfigured) {
    return uploadImageToCloudinary(buffer, filename, mimeType);
  }

  return uploadImageToR2(buffer, filename, mimeType);
};
