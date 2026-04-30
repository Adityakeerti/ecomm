/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['10.235.102.59', '172.18.120.215', 'localhost'],
  images: {
    remotePatterns: [
      // Cloudinary (if used by backend)
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      // Cloudflare R2 (if used by backend)
      { protocol: 'https', hostname: '*.r2.cloudflarestorage.com' },
    ],
  },
};

export default nextConfig;
