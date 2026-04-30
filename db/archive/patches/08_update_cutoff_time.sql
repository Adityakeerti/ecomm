-- =============================================================================
-- Migration: Update default cutoff time from 14:00 to 08:00
-- =============================================================================
-- This updates all existing delivery zones to use 8:00 AM cutoff instead of 2:00 PM
-- Run this after the schema change to update existing data

-- Update all zones that still have the old 14:00 default
UPDATE delivery_zones 
SET cutoff_time = '08:00:00'
WHERE cutoff_time = '14:00:00';

-- Verify the change
SELECT 
    label AS zone_name,
    cutoff_time,
    min_order_count
FROM delivery_zones
ORDER BY label;
