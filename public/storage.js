// ============================================================
// storage.js — Capa de datos (Fase 2: servidor + JWT)
// ============================================================

const API_URL = '/api/products';

// ------------------------------------------------------------
// getToken() — obtiene el token JWT guardado
// ------------------------------------------------------------
function getToken() {
  return localStorage.getItem('admin_token');
  // El token se guarda en localStorage al hacer login
}

// ------------------------------------------------------------
// authHeaders() — genera los headers con el token
// Todas las peticiones protegidas usan estos headers
// ------------------------------------------------------------
function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + getToken()
    // "Bearer TOKEN" es el formato estándar para JWT
  };
}

// ------------------------------------------------------------
// getProducts() — pública, no requiere token
// ------------------------------------------------------------
// getProducts() — obtiene todos los productos sin filtros
// Se usa internamente para poblar categorías y marcas
async function getProducts() {
  const response = await fetch(API_URL + '?limit=1000');
  // limit=1000 para traer todos sin filtros
  // Solo se usa en el admin y para poblar dropdowns
  const data = await response.json();
  return data.products || data;
  // Soporta tanto el formato nuevo {products, total}
  // como el formato viejo [array] por compatibilidad
}

// getProductsFiltered() — obtiene productos con filtros del servidor
async function getProductsFiltered(params) {
  const query = new URLSearchParams();
  // URLSearchParams construye la query string de la URL
  // Ejemplo: ?category=cascos&brand=axxis&page=2

  if (params.category)    query.set('category',    params.category);
  if (params.subcategoria) query.set('subcategoria', params.subcategoria);
  if (params.brand)       query.set('brand',       params.brand);
  if (params.search)      query.set('search',      params.search);
  if (params.order)       query.set('order',       params.order);
  if (params.page)        query.set('page',        params.page);
  if (params.limit)       query.set('limit',       params.limit);
  if (params.en_stock)    query.set('en_stock',    params.en_stock);
  if (params.en_oferta)   query.set('en_oferta',   params.en_oferta);
  if (params.destacado)   query.set('destacado',   params.destacado);

  const response = await fetch(API_URL + '?' + query.toString());
  const data     = await response.json();
  return data;
  // Devuelve { products, total, page, totalPages }
}

// ------------------------------------------------------------
// addProduct() — protegida, requiere token
// ------------------------------------------------------------
async function addProduct(product) {
  const response = await fetch(API_URL, {
    method:  'POST',
    headers: authHeaders(),
    body:    JSON.stringify(product)
  });
  const data = await response.json();
  return data;
}

// ------------------------------------------------------------
// updateProduct() — protegida, requiere token
// ------------------------------------------------------------
async function updateProduct(product) {
  const response = await fetch(API_URL + '/' + product.id, {
    method:  'PUT',
    headers: authHeaders(),
    body:    JSON.stringify(product)
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Error al actualizar');
  }
  return data;
}

// ------------------------------------------------------------
// deleteProduct() — protegida, requiere token
// ------------------------------------------------------------
async function deleteProduct(id) {
  await fetch(API_URL + '/' + id, {
    method:  'DELETE',
    headers: authHeaders()
  });
}

// ------------------------------------------------------------
// getCategories() — pública
// ------------------------------------------------------------
async function getCategories() {
  const res = await fetch('/api/categories');
  const grouped = await res.json();
  return Object.keys(grouped);
}