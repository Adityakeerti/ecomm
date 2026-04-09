-- Add image_url column to products table for Cloudflare R2 hosted images
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url VARCHAR(500);
