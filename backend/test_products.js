const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:4000';

async function runTests() {
  console.log('🧪 Starting Products & Inventory Endpoints Test...');
  
  let token = '';
  
  // 1. Login to get token
  try {
    console.log('\n--- 1. Logging in as Admin ---');
    const loginRes = await fetch(`${BASE_URL}/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'superadmin', password: 'admin123' })
    });
    const loginData = await loginRes.json();
    if (!loginData.success) throw new Error('Login failed: ' + JSON.stringify(loginData));
    
    token = loginData.accessToken;
    console.log('✅ Login successful. Token acquired.');
  } catch (err) {
    console.error('❌ Login error:', err.message);
    return;
  }

  const authHeaders = {
    'Authorization': `Bearer ${token}`
  };

  let productId = '';
  let variantId = '';

  // 2. Create a Product
  try {
    console.log('\n--- 2. Creating a Product ---');
    // Using FormData for multipart/form-data. In tests, we omit the image first.
    const formData = new FormData();
    formData.append('name', 'Test Premium Hoodie');
    formData.append('slug', `test-hoodie-${Date.now()}`);
    formData.append('description', 'A really soft test hoodie');
    formData.append('base_price_paise', '129900'); // ₹1299
    formData.append('category_id', '1'); // Assuming '1' is Hoodies from seed data
    
    const createRes = await fetch(`${BASE_URL}/admin/products`, {
      method: 'POST',
      headers: authHeaders, // Do NOT set Content-Type header manually for FormData
      body: formData
    });
    
    const createData = await createRes.json();
    if (!createData.success) throw new Error(JSON.stringify(createData));
    
    productId = createData.data.id;
    console.log('✅ Product created:', createData.data.name, '(ID:', productId, ')');
  } catch (err) {
    console.error('❌ Product creation error:', err.message);
    return;
  }

  // 3. Add a Variant
  try {
    console.log('\n--- 3. Adding a Variant & Initializing Inventory ---');
    const variantRes = await fetch(`${BASE_URL}/admin/products/${productId}/variants`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        size: 'L',
        colour: 'Black',
        sku: `TEST-HOODIE-BLK-L-${Date.now()}`,
        price_paise: 129900
      })
    });
    
    const variantData = await variantRes.json();
    if (!variantData.success) throw new Error(JSON.stringify(variantData));
    
    variantId = variantData.data.id;
    console.log('✅ Variant created with SKU:', variantData.data.sku, '(Inventory Qtys:', variantData.data.inventory, ')');
  } catch (err) {
    console.error('❌ Add variant error:', err.message);
    return;
  }

  // 4. Restock Inventory
  try {
    console.log('\n--- 4. Restocking Inventory ---');
    const restockRes = await fetch(`${BASE_URL}/admin/inventory/${variantId}/restock`, {
      method: 'PATCH',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity_to_add: 50 })
    });
    
    const restockData = await restockRes.json();
    if (!restockData.success) throw new Error(JSON.stringify(restockData));
    
    console.log('✅ Inventory restocked. New Quantity:', restockData.data.quantity);
  } catch (err) {
    console.error('❌ Restock error:', err.message);
    return;
  }

  // 5. Toggle Product Visibility (is_active)
  try {
    console.log('\n--- 5. Toggling Product Active Status ---');
    const toggleRes = await fetch(`${BASE_URL}/admin/products/${productId}/toggle`, {
      method: 'PATCH',
      headers: authHeaders
    });
    
    const toggleData = await toggleRes.json();
    if (!toggleData.success) throw new Error(JSON.stringify(toggleData));
    
    console.log(`✅ Product is_active flipped to: ${toggleData.data.is_active}`);
  } catch (err) {
    console.error('❌ Toggle active error:', err.message);
  }

  // 6. Test Image Upload + Update (Optional if dummy file)
  try {
    console.log('\n--- 6. Updating Product with Temporary Dummy Image ---');
    // We create a tiny fake image buffer to spoof binary file payload
    const dummyImageBuffer = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'); // Fake PNG header
    const imageBlob = new Blob([dummyImageBuffer], { type: 'image/png' });
    
    const updateFormData = new FormData();
    updateFormData.append('description', 'Updated description after image upload');
    updateFormData.append('image', imageBlob, 'test_image.png');

    const updateRes = await fetch(`${BASE_URL}/admin/products/${productId}`, {
      method: 'PUT',
      headers: authHeaders,
      body: updateFormData
    });
    
    const updateData = await updateRes.json();
    if (!updateData.success) throw new Error(JSON.stringify(updateData));
    
    console.log(`✅ Product updated. R2 returned Image URL: ${updateData.data.image_url}`);
    console.log(`(NOTE: If this fails or returns undefined, check your R2 Credentials in .env!)`);
  } catch (err) {
    console.error('❌ Product update / image upload error:', err.message);
  }

  console.log('\n🎉 All operations complete! 🎉');
}

runTests();
